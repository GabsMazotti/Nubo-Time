// Worker do cron (rode a cada 1 minuto). Processa as tarefas vencidas:
// lembretes de confirmaÃ§Ã£o (1h/30min), checagem de no-show, e follow-ups do 1Âº contato.
import { admin, addHistory } from "../_shared/db.ts";
import { json } from "../_shared/cors.ts";
import { sendText } from "../_shared/zapi.ts";
import { TEMPLATES } from "../_shared/persona.ts";
import { formatHorario, formatDataHora } from "../_shared/util.ts";

async function notifyGabriel(db: ReturnType<typeof admin>, leadId: string, msg: string) {
  const gabriel = Deno.env.get("GABRIEL_WHATSAPP_NUMBER");
  if (!gabriel) { await addHistory(db, leadId, "gabriel_notify_skipped", "GABRIEL_WHATSAPP_NUMBER nÃ£o configurado.", { msg }); return; }
  const g = await sendText(gabriel, msg);
  await addHistory(db, leadId, "gabriel_notified", msg, { sent_ok: g.ok, reason: g.reason });
}

async function leadReplied(lead: Record<string, unknown>): Promise<boolean> {
  const inbound = lead.last_inbound_at ? new Date(lead.last_inbound_at as string).getTime() : 0;
  return inbound > 0;
}

Deno.serve(async (req) => {
  // ProteÃ§Ã£o opcional por segredo (header x-cron-secret)
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
    if (!claimed) continue; // outra execuÃ§Ã£o pegou

    try {
      const { data: lead } = await db.from("aa_leads").select("*").eq("id", task.lead_id).single();
      const nome = (lead?.name as string) ?? "tudo bem";
      const phone = lead?.phone as string | null;
      let done = true;

      // Bot pausado para este lead (humano assumiu) -> nÃ£o dispara nada automÃ¡tico.
      if (lead?.bot_paused) {
        await db.from("aa_scheduled_tasks").update({ status: "canceled", executed_at: new Date().toISOString() }).eq("id", task.id);
        processed++; continue;
      }

      // follow-ups do 1Âº contato: sÃ³ se o lead NÃƒO respondeu
      if (task.type.startsWith("followup_first_contact")) {
        if (await leadReplied(lead)) {
          // jÃ¡ respondeu -> nÃ£o precisa de follow-up
          await db.from("aa_scheduled_tasks").update({ status: "canceled" }).eq("id", task.id);
          processed++; continue;
        }
        if (phone) {
          const body = task.type === "followup_first_contact_30min" ? TEMPLATES.followup30min(nome)
            : task.type === "followup_first_contact_4h" ? TEMPLATES.followup4h(nome)
            : TEMPLATES.followupNextDay(nome);
          const s = await sendText(phone, body);
          await db.from("aa_messages").insert({ lead_id: lead.id, direction: "outbound", body, external_id: s.id ?? null, meta: { kind: task.type } });
          await addHistory(db, lead.id, "followup_sent", body, { type: task.type, sent_ok: s.ok });
          if (task.type === "followup_first_contact_next_day") {
            await db.from("aa_leads").update({ status: "sem_resposta" }).eq("id", lead.id);
          }
        }
      }

      // lembretes de reuniÃ£o
      else if (task.type === "meeting_confirmation_1h" || task.type === "meeting_confirmation_30min") {
        const { data: appt } = await db.from("aa_appointments").select("*").eq("id", task.appointment_id).maybeSingle();
        if (appt && appt.status !== "cancelada" && appt.confirmation_status === "pendente" && phone) {
          // Anti-duplicaÃ§Ã£o: cancela quaisquer OUTROS lembretes pendentes do mesmo tipo p/ este lead
          // (corrida respondi-webhook x calendly-webhook pode ter criado lembretes em dobro).
          await db.from("aa_scheduled_tasks").update({ status: "canceled" })
            .eq("lead_id", lead.id).eq("type", task.type).eq("status", "pending").neq("id", task.id);
          const horario = appt.scheduled_at ? formatHorario(appt.scheduled_at) : "o horÃ¡rio combinado";
          const body = task.type === "meeting_confirmation_1h"
            ? TEMPLATES.confirmation1h(nome, horario)
            : TEMPLATES.confirmation30min(nome, horario);
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
          await addHistory(db, lead.id, "status_change", "Lead nÃ£o confirmou presenÃ§a (risco de no-show).");
          const horario = appt.scheduled_at ? formatDataHora(appt.scheduled_at) : "o horÃ¡rio combinado";
          await notifyGabriel(db, lead.id, TEMPLATES.gabrielNoShowRisk({ nome, whatsapp: phone ?? "â€”", horario }));
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
