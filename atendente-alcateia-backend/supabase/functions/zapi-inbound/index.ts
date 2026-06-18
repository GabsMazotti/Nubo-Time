// Respostas do lead no WhatsApp (webhook "on-message-received" da Z-API).
// Fluxo: dedup -> salva inbound -> cérebro decide -> responde -> aplica status/ações -> avisa Gabriel se preciso.
import { admin, addHistory } from "../_shared/db.ts";
import { json } from "../_shared/cors.ts";
import { parseInbound, sendText } from "../_shared/zapi.ts";
import { callBrain } from "../_shared/anthropic.ts";
import { isValidStatus } from "../_shared/pipeline.ts";
import { CALENDLY_URL, TEMPLATES } from "../_shared/persona.ts";
import { formatDataHora } from "../_shared/util.ts";
import { cancelCalendlyEvent } from "../_shared/calendly.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let payload: Record<string, unknown>;
  try { payload = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const inb = parseInbound(payload);
  if (inb.fromMe) return json({ ok: true, ignored: "from_me" });
  if (!inb.phone) return json({ ok: true, ignored: "sem_telefone" });

  const db = admin();
  const phone = inb.phone.replace(/\D/g, "");

  // Acha o lead pelo telefone (com e sem 9º dígito, por garantia)
  const { data: lead } = await db.from("aa_leads").select("*").eq("phone", phone).maybeSingle();
  if (!lead) return json({ ok: true, ignored: "lead_nao_encontrado", phone });

  if (lead.opted_out) return json({ ok: true, ignored: "opt_out" });

  // Dedup por id da mensagem
  if (inb.messageId) {
    const { data: dup } = await db.from("aa_messages").select("id").eq("external_id", inb.messageId).maybeSingle();
    if (dup) return json({ ok: true, deduped: true });
  }

  // Salva a mensagem recebida
  await db.from("aa_messages").insert({
    lead_id: lead.id, direction: "inbound",
    body: inb.text ?? (inb.isAudio ? "[áudio]" : inb.isMedia ? "[arquivo]" : "[mensagem]"),
    external_id: inb.messageId ?? null,
    meta: { isAudio: inb.isAudio, isMedia: inb.isMedia },
  });
  await db.from("aa_leads").update({
    last_inbound_at: new Date().toISOString(),
    status: ["novo_lead", "contato_realizado"].includes(lead.status) ? "em_atendimento" : lead.status,
  }).eq("id", lead.id);
  await addHistory(db, lead.id, "inbound", inb.text ?? "[mídia]", { isAudio: inb.isAudio, isMedia: inb.isMedia });

  // Lead respondeu -> cancela os follow-ups de primeiro contato pendentes
  await db.from("aa_scheduled_tasks").update({ status: "canceled" })
    .eq("lead_id", lead.id).eq("status", "pending")
    .in("type", ["followup_first_contact_30min", "followup_first_contact_4h", "followup_first_contact_next_day"]);

  // Monta o histórico da conversa para o cérebro
  const { data: msgs } = await db.from("aa_messages").select("direction, body").eq("lead_id", lead.id).order("created_at", { ascending: true }).limit(20);
  const conversation = (msgs ?? []).map((m) => ({
    role: m.direction === "inbound" ? ("user" as const) : ("assistant" as const),
    content: m.body ?? "",
  }));

  // Contexto de agendamento (para o cérebro saber se o lead já tem reunião)
  const { data: appt } = await db.from("aa_appointments")
    .select("id,calendly_event_id,scheduled_at,status,confirmation_status")
    .eq("lead_id", lead.id).neq("status", "cancelada")
    .order("scheduled_at", { ascending: false }).limit(1).maybeSingle();
  const agendamento = appt
    ? { tem_reuniao: true, quando: appt.scheduled_at ? formatDataHora(appt.scheduled_at) : "horário a confirmar", status: appt.status, confirmacao: appt.confirmation_status }
    : { tem_reuniao: false };

  // Cérebro decide
  let decision;
  try {
    decision = await callBrain({
      lead: { ...lead, agendamento },
      conversation,
      situation: inb.isAudio
        ? "O lead enviou um ÁUDIO e você NÃO consegue ouvir. Peça gentilmente que ele mande por TEXTO e avise o Gabriel (needs_human=true, notify_gabriel=true, status precisa_humano). Não suma."
        : inb.isMedia
        ? "O lead enviou um ARQUIVO/MÍDIA que você não consegue abrir. Peça que ele descreva o essencial por TEXTO e avise o Gabriel (needs_human=true, notify_gabriel=true, status precisa_humano). Não suma."
        : undefined,
    });
  } catch (e) {
    await addHistory(db, lead.id, "error", `Falha no cérebro: ${(e as Error).message}`);
    return json({ ok: true, warning: "falha_brain", detail: (e as Error).message });
  }

  // Mídia força handoff (segurança extra)
  if (inb.isAudio || inb.isMedia) { decision.needs_human = true; decision.status = "precisa_humano"; }

  const newStatus = isValidStatus(decision.status) ? decision.status : lead.status;

  // Monta a resposta
  let reply = decision.reply ?? "";
  if (newStatus === "remarcar_reuniao" && !reply.includes("calendly.com")) {
    // Remarcação: link do evento de REMARCAÇÃO (antecedência baixa) — permite mover same-day.
    // A reunião antiga é cancelada automaticamente quando a nova entra (calendly-webhook).
    const reschedUrl = Deno.env.get("CALENDLY_RESCHEDULE_URL") ?? CALENDLY_URL;
    reply += `\n\nSem problemas! Pra remarcar, é só escolher um novo horário por aqui: ${reschedUrl}`;
  } else if (decision.send_calendly && reply && !reply.includes("calendly.com")) {
    reply += `\n\n${TEMPLATES.calendlyLine(CALENDLY_URL)}`;
  }

  // Envia a resposta ao lead
  let sent = { ok: false } as { ok: boolean; id?: string; reason?: string };
  if (reply.trim()) {
    sent = await sendText(phone, reply);
    await db.from("aa_messages").insert({ lead_id: lead.id, direction: "outbound", body: reply, external_id: sent.id ?? null, meta: { sent_ok: sent.ok, reason: sent.reason } });
  }

  // Aplica status/decisões
  await db.from("aa_leads").update({
    status: newStatus,
    temperature: decision.temperature,
    qualified: decision.qualified,
    needs_human: decision.needs_human || lead.needs_human,
    opted_out: newStatus === "opt_out" ? true : lead.opted_out,
    last_outbound_at: reply.trim() ? new Date().toISOString() : lead.last_outbound_at,
  }).eq("id", lead.id);
  await addHistory(db, lead.id, "agent_decision", decision.history_note ?? reply, {
    status: newStatus, temperature: decision.temperature, qualified: decision.qualified,
    needs_human: decision.needs_human, send_calendly: decision.send_calendly,
  });

  // Sincroniza o agendamento conforme o status decidido
  if (newStatus === "call_confirmada") {
    await db.from("aa_appointments").update({ confirmation_status: "confirmada", status: "confirmada" })
      .eq("lead_id", lead.id).neq("status", "cancelada");
    await db.from("aa_scheduled_tasks").update({ status: "canceled" })
      .eq("lead_id", lead.id).eq("status", "pending")
      .in("type", ["meeting_confirmation_1h", "meeting_confirmation_30min", "meeting_noshow_check"]);
  } else if (newStatus === "remarcar_reuniao" || newStatus === "reuniao_cancelada") {
    await db.from("aa_scheduled_tasks").update({ status: "canceled" })
      .eq("lead_id", lead.id).eq("status", "pending")
      .in("type", ["meeting_confirmation_1h", "meeting_confirmation_30min", "meeting_noshow_check"]);
    // Cancelamento definitivo: cancela a reunião no Calendly via API (sem deixar slot ocupado).
    if (newStatus === "reuniao_cancelada" && appt?.calendly_event_id) {
      const ok = await cancelCalendlyEvent(appt.calendly_event_id, "Cancelado a pedido do lead via WhatsApp");
      await db.from("aa_appointments").update({ status: "cancelada", confirmation_status: "recusada" })
        .eq("lead_id", lead.id).neq("status", "cancelada");
      await addHistory(db, lead.id, "calendly", `Reunião cancelada no Calendly via API (${ok ? "ok" : "falha"}).`);
    }
  }

  // Avisa o Gabriel se necessário
  if (decision.notify_gabriel) {
    const gabriel = Deno.env.get("GABRIEL_WHATSAPP_NUMBER");
    const msg = decision.gabriel_message ?? `Atendimento do lead ${lead.name} precisa da sua atenção.`;
    if (gabriel) {
      const g = await sendText(gabriel, msg);
      await addHistory(db, lead.id, "gabriel_notified", msg, { sent_ok: g.ok, reason: g.reason });
    } else {
      await addHistory(db, lead.id, "gabriel_notify_skipped", "GABRIEL_WHATSAPP_NUMBER não configurado.", { msg });
    }
  }

  return json({ ok: true, lead_id: lead.id, status: newStatus, replied: sent.ok });
});
