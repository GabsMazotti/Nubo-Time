// Webhook do Calendly: agendamento criado / remarcado / cancelado.
// Registra o agendamento e cria as tarefas de confirmação (1h e 30min antes) + checagem de no-show.
import { admin, addHistory } from "../_shared/db.ts";
import { json } from "../_shared/cors.ts";
import { cancelCalendlyEvent, detectFunnel, parseCalendlyWebhook } from "../_shared/calendly.ts";
import { APPOINTMENT_TASK_TYPES, DOSSIE_TASK } from "../_shared/pipeline.ts";
import { syncRemarketing } from "../_shared/stages.ts";
import { funnelContext, funnelDefaults, isGloballyPaused } from "../_shared/config.ts";
import { sendBlocks } from "../_shared/zapi.ts";
import { formatDiaHora } from "../_shared/util.ts";

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

  if (await isGloballyPaused()) return json({ ok: true, paused_global: true });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const ev = parseCalendlyWebhook(body);
  const db = admin();

  // Encontra ou cria o lead
  let lead = await findLead(db, ev);
  let isNewLead = false;
  if (!lead) {
    const { data } = await db.from("aa_leads").insert({
      name: ev.name ?? "lead", phone: ev.phone ?? null, phone_valid: Boolean(ev.phone),
      email: ev.email ?? null, source: "calendly", status: "call_agendada", temperature: "quente",
      funnel: detectFunnel(body),
    }).select().single();
    lead = data;
    isNewLead = true;
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
      .in("type", APPOINTMENT_TASK_TYPES);
    // Cancelou a reunião: se já era qualificado, cai na etapa "qualificado sem agendar" (vira remarketing).
    const cancelStage = lead.qualified ? "qualificado_sem_agendar" : (lead.stage ?? null);
    await db.from("aa_leads").update({
      status: "reuniao_cancelada",
      ...(lead.qualified ? { stage: "qualificado_sem_agendar", stage_changed_at: new Date().toISOString() } : {}),
    }).eq("id", lead.id);
    if (lead.qualified) {
      await db.from("aa_stage_history").insert({ lead_id: lead.id, from_stage: lead.stage ?? null, to_stage: "qualificado_sem_agendar", reason: "system" });
    }
    await syncRemarketing(db, { id: lead.id, qualified_at: lead.qualified_at }, {
      stageKey: cancelStage, qualified: !!lead.qualified, hasActiveAppt: false, reason: "reuniao_cancelada",
    });
    await addHistory(db, lead.id, "calendly", "Reunião cancelada no Calendly.", { ev });
    return json({ ok: true, lead_id: lead.id, action: "canceled" });
  }

  // ----- CRIADO / REMARCADO -----
  if (!ev.scheduledAt) return json({ ok: true, lead_id: lead.id, warning: "sem_horario" });

  // Remarcação: cancela lembretes antigos
  await db.from("aa_scheduled_tasks").update({ status: "canceled" })
    .eq("lead_id", lead.id).eq("status", "pending")
    .in("type", APPOINTMENT_TASK_TYPES);

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

  await db.from("aa_leads").update({
    status: "call_agendada", temperature: "quente",
    stage: "reuniao_marcada", stage_changed_at: new Date().toISOString(),
  }).eq("id", lead.id);
  if (lead.stage !== "reuniao_marcada") {
    await db.from("aa_stage_history").insert({ lead_id: lead.id, from_stage: lead.stage ?? null, to_stage: "reuniao_marcada", reason: "system" });
  }
  // Marcou reunião -> sai da fila de remarketing (recuperado) e zera a coluna remarketing.
  await syncRemarketing(db, { id: lead.id, qualified_at: lead.qualified_at }, {
    stageKey: "reuniao_marcada", qualified: !!lead.qualified, hasActiveAppt: true,
  });
  await addHistory(db, lead.id, "calendly", `Call ${ev.kind === "rescheduled" ? "remarcada" : "agendada"} para ${ev.scheduledAt}.`, { ev });

  // Agenda os lembretes (3h / 1h / 10min antes) + checagem de no-show (5min)
  const start = new Date(ev.scheduledAt).getTime();
  const tasks = [
    // Lembretes conforme a agenda do FUNIL do lead (Alcateia 3h/1h/10min · Mentoria 1h/30min/10min).
    ...funnelDefaults(lead.funnel).reminders.map((r) => ({ type: r.type, at: start - r.offsetMin * 60_000 })),
    { type: "meeting_noshow_check", at: start - 5 * 60_000 },
    { type: DOSSIE_TASK, at: start - 60 * 60_000 }, // dossiê pré-call: 1h antes (só envia se confirmou)
  ].filter((t) => t.at > Date.now()); // só agenda lembretes/dossiê futuros

  if (tasks.length) {
    await db.from("aa_scheduled_tasks").insert(tasks.map((t) => ({
      lead_id: lead.id, appointment_id: appt?.id ?? null,
      type: t.type, scheduled_for: new Date(t.at).toISOString(),
    })));
  }

  // Rede de segurança: se ESTE webhook criou o lead (sinal de que o respondi-webhook NÃO disparou),
  // manda a 1ª mensagem de confirmação agora — senão o lead que agenda pelo Calendly do form fica
  // sem WhatsApp. Se o respondi disparar, ele acha o lead já contatado e não duplica.
  if (isNewLead && lead.phone) {
    // CLAIM ATÔMICO: só envia se ninguém (respondi) já trancou o 1º contato — evita duplicar na corrida.
    const { data: claimed } = await db.from("aa_leads")
      .update({ first_contact_sent_at: new Date().toISOString(), last_outbound_at: new Date().toISOString() })
      .eq("id", lead.id).is("first_contact_sent_at", null).select("id").maybeSingle();
    if (claimed) {
      const fctx = await funnelContext(lead.funnel);
      const quando = ev.scheduledAt ? formatDiaHora(ev.scheduledAt) : "";
      const firstMsg = fctx.templates.confirmacaoGabriel((lead.name as string) ?? "tudo bem", quando);
      const sent = await sendBlocks(lead.phone as string, firstMsg);
      for (const r of sent.results) {
        await db.from("aa_messages").insert({ lead_id: lead.id, direction: "outbound", body: r.body, external_id: r.id ?? null, meta: { kind: "first_contact_calendly", sent_ok: r.ok, reason: r.reason } });
      }
      await addHistory(db, lead.id, "first_contact_sent", firstMsg, { via: "calendly-webhook", sent_ok: sent.ok });
    }
  }

  return json({ ok: true, lead_id: lead.id, action: ev.kind, reminders: tasks.length });
});
