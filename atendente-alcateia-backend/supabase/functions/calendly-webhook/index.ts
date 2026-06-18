// Webhook do Calendly: agendamento criado / remarcado / cancelado.
// Registra o agendamento e cria as tarefas de confirmação (1h e 30min antes) + checagem de no-show.
import { admin, addHistory } from "../_shared/db.ts";
import { json } from "../_shared/cors.ts";
import { cancelCalendlyEvent, parseCalendlyWebhook } from "../_shared/calendly.ts";

async function findLead(db: ReturnType<typeof admin>, ev: { phone?: string; email?: string; name?: string }) {
  if (ev.phone) {
    const { data } = await db.from("aa_leads").select("*").eq("phone", ev.phone).maybeSingle();
    if (data) return data;
  }
  if (ev.email) {
    const { data } = await db.from("aa_leads").select("*").eq("email", ev.email).maybeSingle();
    if (data) return data;
  }
  if (ev.name) {
    const { data } = await db.from("aa_leads").select("*").ilike("name", ev.name).limit(1).maybeSingle();
    if (data) return data;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const ev = parseCalendlyWebhook(body);
  const db = admin();

  // Encontra ou cria o lead
  let lead = await findLead(db, ev);
  if (!lead) {
    const { data } = await db.from("aa_leads").insert({
      name: ev.name ?? "lead", phone: ev.phone ?? null, phone_valid: Boolean(ev.phone),
      email: ev.email ?? null, source: "calendly", status: "call_agendada", temperature: "quente",
    }).select().single();
    lead = data;
    if (lead) await addHistory(db, lead.id, "lead_received", "Lead criado a partir de agendamento no Calendly.", { ev });
  }
  if (!lead) return json({ error: "lead_upsert_failed" }, 500);

  // ----- CANCELAMENTO -----
  if (ev.kind === "canceled") {
    if (ev.eventId) {
      await db.from("aa_appointments").update({ status: "cancelada", confirmation_status: "recusada" }).eq("calendly_event_id", ev.eventId);
    }
    await db.from("aa_scheduled_tasks").update({ status: "canceled" })
      .eq("lead_id", lead.id).eq("status", "pending")
      .in("type", ["meeting_confirmation_1h", "meeting_confirmation_30min", "meeting_noshow_check"]);
    await db.from("aa_leads").update({ status: "reuniao_cancelada" }).eq("id", lead.id);
    await addHistory(db, lead.id, "calendly", "Reunião cancelada no Calendly.", { ev });
    return json({ ok: true, lead_id: lead.id, action: "canceled" });
  }

  // ----- CRIADO / REMARCADO -----
  if (!ev.scheduledAt) return json({ ok: true, lead_id: lead.id, warning: "sem_horario" });

  // Remarcação: cancela lembretes antigos
  await db.from("aa_scheduled_tasks").update({ status: "canceled" })
    .eq("lead_id", lead.id).eq("status", "pending")
    .in("type", ["meeting_confirmation_1h", "meeting_confirmation_30min", "meeting_noshow_check"]);

  // Supersede: se o lead já tinha OUTRA reunião ativa (evento diferente), cancela a antiga no Calendly.
  const { data: oldAppts } = await db.from("aa_appointments")
    .select("id,calendly_event_id").eq("lead_id", lead.id).neq("status", "cancelada");
  for (const old of (oldAppts ?? [])) {
    if (old.calendly_event_id && old.calendly_event_id !== ev.eventId) {
      await cancelCalendlyEvent(old.calendly_event_id, "Remarcado pelo lead");
      await db.from("aa_appointments").update({ status: "cancelada", confirmation_status: "recusada" }).eq("id", old.id);
      await addHistory(db, lead.id, "calendly", `Reunião anterior cancelada por remarcação (evento ${old.calendly_event_id}).`);
    }
  }

  // Cria/atualiza o agendamento (idempotente por calendly_event_id)
  const { data: appt } = await db.from("aa_appointments").upsert({
    lead_id: lead.id,
    scheduled_at: ev.scheduledAt,
    status: ev.kind === "rescheduled" ? "remarcada" : "agendada",
    confirmation_status: "pendente",
    meeting_url: ev.meetingUrl ?? null,
    source: "calendly",
    calendly_event_id: ev.eventId ?? null,
  }, { onConflict: "calendly_event_id" }).select().single();

  await db.from("aa_leads").update({ status: "call_agendada", temperature: "quente" }).eq("id", lead.id);
  await addHistory(db, lead.id, "calendly", `Call ${ev.kind === "rescheduled" ? "remarcada" : "agendada"} para ${ev.scheduledAt}.`, { ev });

  // Agenda os lembretes
  const start = new Date(ev.scheduledAt).getTime();
  const tasks = [
    { type: "meeting_confirmation_1h", at: start - 60 * 60_000 },
    { type: "meeting_confirmation_30min", at: start - 30 * 60_000 },
    { type: "meeting_noshow_check", at: start - 15 * 60_000 },
  ].filter((t) => t.at > Date.now()); // só agenda lembretes futuros

  if (tasks.length) {
    await db.from("aa_scheduled_tasks").insert(tasks.map((t) => ({
      lead_id: lead.id, appointment_id: appt?.id ?? null,
      type: t.type, scheduled_for: new Date(t.at).toISOString(),
    })));
  }

  return json({ ok: true, lead_id: lead.id, action: ev.kind, reminders: tasks.length });
});
