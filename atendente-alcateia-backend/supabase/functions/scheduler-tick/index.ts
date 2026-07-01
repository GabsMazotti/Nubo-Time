// Worker do cron (rode a cada 1 minuto). Processa as tarefas vencidas:
// lembretes de confirmação (1h/30min), checagem de no-show, e follow-ups do 1º contato.
import { admin, addHistory } from "../_shared/db.ts";
import { json } from "../_shared/cors.ts";
import { sendText } from "../_shared/zapi.ts";
import { TEMPLATES } from "../_shared/persona.ts";
import { funnelContext } from "../_shared/config.ts";
import { formatHorario, formatDataHora } from "../_shared/util.ts";
import { formatDossie, generateDossie } from "../_shared/dossie.ts";

async function notifyGabriel(db: ReturnType<typeof admin>, leadId: string, msg: string) {
  const gabriel = Deno.env.get("GABRIEL_WHATSAPP_NUMBER");
  if (!gabriel) { await addHistory(db, leadId, "gabriel_notify_skipped", "GABRIEL_WHATSAPP_NUMBER não configurado.", { msg }); return; }
  const g = await sendText(gabriel, msg);
  await addHistory(db, leadId, "gabriel_notified", msg, { sent_ok: g.ok, reason: g.reason });
}

async function leadReplied(lead: Record<string, unknown>): Promise<boolean> {
  const inbound = lead.last_inbound_at ? new Date(lead.last_inbound_at as string).getTime() : 0;
  return inbound > 0;
}

Deno.serve(async (req) => {
  // Proteção opcional por segredo (header x-cron-secret)
  const secret = Deno.env.get("SCHEDULER_SECRET");
  if (secret && req.headers.get("x-cron-secret") !== secret) return json({ error: "unauthorized" }, 401);

  const db = admin();
  const nowIso = new Date().toISOString();

  // Pega tarefas vencidas
  const { data: tasks } = await db.from("aa_scheduled_tasks")
    .select("*").eq("status", "pending").lte("scheduled_for", nowIso)
    .order("scheduled_for", { ascending: true }).limit(50);

  if (!tasks || tasks.length === 0) return json({ ok: true, processed: 0 });

  let processed = 0;
  for (const task of tasks) {
    // trava otimista: marca processing
    const { data: claimed } = await db.from("aa_scheduled_tasks")
      .update({ status: "processing", attempts: (task.attempts ?? 0) + 1 })
      .eq("id", task.id).eq("status", "pending").select().maybeSingle();
    if (!claimed) continue; // outra execução pegou

    try {
      const { data: lead } = await db.from("aa_leads").select("*").eq("id", task.lead_id).single();
      // Templates do FUNIL do lead (alcateia x mentoria) — lembrete/follow-up na voz certa.
      const T = (await funnelContext(lead?.funnel)).templates;
      const nome = (lead?.name as string) ?? "tudo bem";
      const phone = lead?.phone as string | null;
      let done = true;

      // Bot pausado (humano assumiu) -> não dispara nada AO LEAD. Exceção: o dossiê é INTERNO
      // (vai pro Gabriel, não pro lead), então dispara mesmo com o bot pausado.
      if (lead?.bot_paused && task.type !== "dossie_prep") {
        await db.from("aa_scheduled_tasks").update({ status: "canceled", executed_at: new Date().toISOString() }).eq("id", task.id);
        processed++; continue;
      }

      // follow-ups do 1º contato: só se o lead NÃO respondeu
      if (task.type.startsWith("followup_first_contact")) {
        if (await leadReplied(lead)) {
          // já respondeu -> não precisa de follow-up
          await db.from("aa_scheduled_tasks").update({ status: "canceled" }).eq("id", task.id);
          processed++; continue;
        }
        if (phone) {
          const body = task.type === "followup_first_contact_30min" ? T.followup30min(nome)
            : task.type === "followup_first_contact_4h" ? T.followup4h(nome)
            : T.followupNextDay(nome);
          const s = await sendText(phone, body);
          await db.from("aa_messages").insert({ lead_id: lead.id, direction: "outbound", body, external_id: s.id ?? null, meta: { kind: task.type } });
          await addHistory(db, lead.id, "followup_sent", body, { type: task.type, sent_ok: s.ok });
          if (task.type === "followup_first_contact_next_day") {
            await db.from("aa_leads").update({ status: "sem_resposta" }).eq("id", lead.id);
          }
        }
      }

      // lembretes de reunião (3h / 1h / 10min antes) — com o link da call
      else if (["meeting_confirmation_3h", "meeting_confirmation_1h", "meeting_confirmation_10min", "meeting_confirmation_30min"].includes(task.type)) {
        const { data: appt } = await db.from("aa_appointments").select("*").eq("id", task.appointment_id).maybeSingle();
        if (appt && appt.status !== "cancelada" && appt.confirmation_status === "pendente" && phone) {
          // Anti-duplicação: cancela quaisquer OUTROS lembretes pendentes do mesmo tipo p/ este lead
          // (corrida respondi-webhook x calendly-webhook pode ter criado lembretes em dobro).
          await db.from("aa_scheduled_tasks").update({ status: "canceled" })
            .eq("lead_id", lead.id).eq("type", task.type).eq("status", "pending").neq("id", task.id);
          const horario = appt.scheduled_at ? formatHorario(appt.scheduled_at) : "o horário combinado";
          const link = (appt.meeting_url as string | null) ?? "";
          const body = task.type === "meeting_confirmation_3h" ? T.lembrete3h(nome, horario, link)
            : task.type === "meeting_confirmation_30min" ? T.lembrete30min(nome, horario, link)
            : task.type === "meeting_confirmation_10min" ? T.lembrete10min(nome, horario, link)
            : T.lembrete1h(nome, horario, link); // 1h (e legado) usam o lembrete de 1h
          const s = await sendText(phone, body);
          await db.from("aa_messages").insert({ lead_id: lead.id, direction: "outbound", body, external_id: s.id ?? null, meta: { kind: task.type } });
          await addHistory(db, lead.id, "reminder_sent", body, { type: task.type, sent_ok: s.ok });
        }
      }

      // checagem de no-show
      else if (task.type === "meeting_noshow_check") {
        const { data: appt } = await db.from("aa_appointments").select("*").eq("id", task.appointment_id).maybeSingle();
        if (appt && appt.status !== "cancelada" && appt.confirmation_status === "pendente") {
          await db.from("aa_appointments").update({ confirmation_status: "sem_resposta", status: "nao_confirmada" }).eq("id", appt.id);
          await db.from("aa_leads").update({ status: "risco_no_show" }).eq("id", lead.id);
          await addHistory(db, lead.id, "status_change", "Lead não confirmou presença (risco de no-show).");
          const horario = appt.scheduled_at ? formatDataHora(appt.scheduled_at) : "o horário combinado";
          await notifyGabriel(db, lead.id, TEMPLATES.gabrielNoShowRisk({ nome, whatsapp: phone ?? "—", horario }));
        }
      }

      // dossiê pré-call (1h antes) — SÓ envia se a reunião está ATIVA e CONFIRMADA.
      else if (task.type === "dossie_prep") {
        const { data: appt } = await db.from("aa_appointments").select("*").eq("id", task.appointment_id).maybeSingle();
        const gabriel = Deno.env.get("GABRIEL_WHATSAPP_NUMBER");
        if (appt && appt.status !== "cancelada" && appt.confirmation_status === "confirmada" && gabriel && lead) {
          // anti-duplicação: cancela outros dossiês pendentes do mesmo lead
          await db.from("aa_scheduled_tasks").update({ status: "canceled" })
            .eq("lead_id", lead.id).eq("type", "dossie_prep").eq("status", "pending").neq("id", task.id);
          const { data: msgs } = await db.from("aa_messages").select("direction,body")
            .eq("lead_id", lead.id).order("created_at", { ascending: false }).limit(30);
          const conversation = (msgs ?? []).reverse().map((m) => ({
            role: m.direction === "inbound" ? ("user" as const) : ("assistant" as const), content: m.body ?? "",
          }));
          const funnelLabel = (lead.funnel === "mentoria") ? "🎓 Mentoria" : "🐺 Alcateia";
          const fields = await generateDossie({ lead, conversation, funnelLabel });
          const text = formatDossie(lead, appt, funnelLabel, fields);
          const s = await sendText(gabriel, text);
          await addHistory(db, lead.id, "dossie_sent", text, { sent_ok: s.ok });
        } else {
          await addHistory(db, lead.id, "dossie_skipped", "Dossiê não enviado (reunião não confirmada ou cancelada).");
        }
      } else {
        done = true; // tipo desconhecido -> apenas conclui
      }

      await db.from("aa_scheduled_tasks").update({ status: done ? "completed" : "pending", executed_at: new Date().toISOString() }).eq("id", task.id);
      processed++;
    } catch (e) {
      await db.from("aa_scheduled_tasks").update({ status: "failed", last_error: (e as Error).message }).eq("id", task.id);
    }
  }

  return json({ ok: true, processed });
});
