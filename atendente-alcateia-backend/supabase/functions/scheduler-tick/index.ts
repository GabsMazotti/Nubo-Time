// Worker do cron (rode a cada 1 minuto). Processa as tarefas vencidas:
// lembretes de confirmação (1h/30min), checagem de no-show, e follow-ups do 1º contato.
import { admin, addHistory } from "../_shared/db.ts";
import { json } from "../_shared/cors.ts";
import { sendText } from "../_shared/zapi.ts";
import { TEMPLATES } from "../_shared/persona.ts";
import { formatHorario, formatDataHora } from "../_shared/util.ts";

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
      const nome = (lead?.name as string) ?? "tudo bem";
      const phone = lead?.phone as string | null;
      let done = true;

      // follow-ups do 1º contato: só se o lead NÃO respondeu
      if (task.type.startsWith("followup_first_contact")) {
        if (await leadReplied(lead)) {
          // já respondeu -> não precisa de follow-up
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

      // lembretes de reunião
      else if (task.type === "meeting_confirmation_1h" || task.type === "meeting_confirmation_30min") {
        const { data: appt } = await db.from("aa_appointments").select("*").eq("id", task.appointment_id).maybeSingle();
        if (appt && appt.status !== "cancelada" && appt.confirmation_status === "pendente" && phone) {
          const horario = appt.scheduled_at ? formatHorario(appt.scheduled_at) : "o horário combinado";
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
          await addHistory(db, lead.id, "status_change", "Lead não confirmou presença (risco de no-show).");
          const horario = appt.scheduled_at ? formatDataHora(appt.scheduled_at) : "o horário combinado";
          await notifyGabriel(db, lead.id, TEMPLATES.gabrielNoShowRisk({ nome, whatsapp: phone ?? "—", horario }));
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
