// Respostas do lead no WhatsApp (webhook "on-message-received" da Z-API).
// Fluxo: dedup -> salva inbound -> cÃ©rebro decide -> responde -> aplica status/aÃ§Ãµes -> avisa Gabriel se preciso.
import { admin, addHistory } from "../_shared/db.ts";
import { json } from "../_shared/cors.ts";
import { parseInbound, sendBlocks, sendText } from "../_shared/zapi.ts";
import { callBrain } from "../_shared/anthropic.ts";
import { isValidStatus } from "../_shared/pipeline.ts";
import { CALENDLY_URL, PERSONA_CONFIRMACAO, PERSONA_REMARKETING, TEMPLATES } from "../_shared/persona.ts";
import { formatDataHora } from "../_shared/util.ts";
import { cancelCalendlyEvent } from "../_shared/calendly.ts";

/** VariaÃ§Ãµes do telefone com/sem o 9Âº dÃ­gito (BR), pra casar o lead mesmo se a Z-API formatar diferente. */
function phoneVariants(p: string): string[] {
  const v = new Set<string>([p]);
  if (p.startsWith("55") && p.length >= 12) {
    const ddd = p.slice(2, 4);
    const rest = p.slice(4);
    if (rest.length === 9 && rest[0] === "9") v.add("55" + ddd + rest.slice(1)); // sem o 9
    if (rest.length === 8) v.add("55" + ddd + "9" + rest);                       // com o 9
  }
  return [...v];
}

/** Detecta intenÃ§Ã£o clara de remarcar/nÃ£o conseguir no horÃ¡rio (rede de seguranÃ§a p/ leads jÃ¡ agendados). */
function wantsReschedule(text?: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase();
  return /(remarc|reagend|adiar|n[Ã£a]o vou conseguir|n[Ã£a]o vou poder|n[Ã£a]o consigo nesse|outro hor[Ã¡a]rio|outro dia|mudar o hor|trocar o hor|mudar a reuni|mudar a call|outro momento)/.test(t);
}

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

  // Acha o lead pelo telefone, tentando variaÃ§Ãµes com/sem o 9Âº dÃ­gito (BR) por garantia.
  const { data: matches } = await db.from("aa_leads").select("*").in("phone", phoneVariants(phone)).limit(1);
  const lead = matches?.[0];
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
    body: inb.text ?? (inb.isAudio ? "[Ã¡udio]" : inb.isMedia ? "[arquivo]" : "[mensagem]"),
    external_id: inb.messageId ?? null,
    meta: { isAudio: inb.isAudio, isMedia: inb.isMedia },
  });
  await db.from("aa_leads").update({
    last_inbound_at: new Date().toISOString(),
    status: ["novo_lead", "contato_realizado"].includes(lead.status) ? "em_atendimento" : lead.status,
  }).eq("id", lead.id);
  await addHistory(db, lead.id, "inbound", inb.text ?? "[mÃ­dia]", { isAudio: inb.isAudio, isMedia: inb.isMedia });

  // Bot pausado (humano assumiu a conversa pela inbox): registra a entrada e NÃƒO responde automaticamente.
  if (lead.bot_paused) {
    await addHistory(db, lead.id, "inbound_paused", "Mensagem recebida â€” bot pausado (humano no controle).");
    return json({ ok: true, bot_paused: true });
  }

  // Lead respondeu -> cancela os follow-ups de primeiro contato pendentes
  await db.from("aa_scheduled_tasks").update({ status: "canceled" })
    .eq("lead_id", lead.id).eq("status", "pending")
    .in("type", ["followup_first_contact_30min", "followup_first_contact_4h", "followup_first_contact_next_day"]);

  // Monta o histÃ³rico da conversa para o cÃ©rebro
  const { data: msgs } = await db.from("aa_messages").select("direction, body").eq("lead_id", lead.id).order("created_at", { ascending: true }).limit(20);
  const conversation = (msgs ?? []).map((m) => ({
    role: m.direction === "inbound" ? ("user" as const) : ("assistant" as const),
    content: m.body ?? "",
  }));

  // Contexto de agendamento (para o cÃ©rebro saber se o lead jÃ¡ tem reuniÃ£o)
  const { data: appt } = await db.from("aa_appointments")
    .select("id,calendly_event_id,scheduled_at,status,confirmation_status")
    .eq("lead_id", lead.id).neq("status", "cancelada")
    .order("scheduled_at", { ascending: false }).limit(1).maybeSingle();
  const agendamento = appt
    ? { tem_reuniao: true, quando: appt.scheduled_at ? formatDataHora(appt.scheduled_at) : "horÃ¡rio a confirmar", status: appt.status, confirmacao: appt.confirmation_status }
    : { tem_reuniao: false };

  // Escolhe o atendente de IA: CONFIRMAÃ‡ÃƒO (jÃ¡ agendou) x REMARKETING/abordagem (nÃ£o agendou).
  const personaPrompt = agendamento.tem_reuniao ? PERSONA_CONFIRMACAO : PERSONA_REMARKETING;

  // CÃ©rebro decide
  let decision;
  try {
    decision = await callBrain({
      lead: { ...lead, agendamento },
      conversation,
      personaPrompt,
      situation: inb.isAudio
        ? "O lead enviou um ÃUDIO e vocÃª NÃƒO consegue ouvir. PeÃ§a gentilmente que ele mande por TEXTO e avise o Gabriel (needs_human=true, notify_gabriel=true, status precisa_humano). NÃ£o suma."
        : inb.isMedia
        ? "O lead enviou um ARQUIVO/MÃDIA que vocÃª nÃ£o consegue abrir. PeÃ§a que ele descreva o essencial por TEXTO e avise o Gabriel (needs_human=true, notify_gabriel=true, status precisa_humano). NÃ£o suma."
        : undefined,
    });
  } catch (e) {
    await addHistory(db, lead.id, "error", `Falha no cÃ©rebro: ${(e as Error).message}`);
    return json({ ok: true, warning: "falha_brain", detail: (e as Error).message });
  }

  // MÃ­dia forÃ§a handoff (seguranÃ§a extra)
  if (inb.isAudio || inb.isMedia) { decision.needs_human = true; decision.status = "precisa_humano"; }

  const brainStatus = isValidStatus(decision.status) ? decision.status : lead.status;
  // Rede de seguranÃ§a: se o lead JÃ tem reuniÃ£o e sinaliza claramente que quer remarcar/nÃ£o consegue, forÃ§a a
  // remarcaÃ§Ã£o mesmo que o cÃ©rebro nÃ£o tenha marcado o status (evita a resposta confusa de pedir horÃ¡rio + link).
  const newStatus = (agendamento.tem_reuniao === true && brainStatus !== "reuniao_cancelada" && wantsReschedule(inb.text))
    ? "remarcar_reuniao"
    : brainStatus;

  // Monta a resposta
  let reply = decision.reply ?? "";
  if (newStatus === "remarcar_reuniao") {
    // RemarcaÃ§Ã£o: mensagem DETERMINÃSTICA (reconhece + manda o link), pra evitar o conflito de
    // "pedir um horÃ¡rio" e "mandar link" na mesma resposta. Link do evento de REMARCAÃ‡ÃƒO (antecedÃªncia baixa).
    // A reuniÃ£o antiga Ã© cancelada automaticamente quando a nova entra (calendly-webhook).
    const reschedUrl = Deno.env.get("CALENDLY_RESCHEDULE_URL") ?? CALENDLY_URL;
    reply = TEMPLATES.remarcacao((lead.name as string) ?? "tudo bem", reschedUrl);
  } else if (!agendamento.tem_reuniao && decision.send_calendly && reply && !reply.includes("calendly.com")) {
    // SÃ³ oferece o link de agendamento se o lead AINDA nÃ£o tem reuniÃ£o (evita reoferecer a quem jÃ¡ agendou).
    reply += `\n\n${TEMPLATES.calendlyLine(CALENDLY_URL)}`;
  }

  // Envia a resposta ao lead â€” em BLOCOS (cada parÃ¡grafo Ã© uma mensagem), pra soar natural.
  let sent = { ok: false } as { ok: boolean; id?: string; reason?: string };
  if (reply.trim()) {
    const b = await sendBlocks(phone, reply);
    sent = { ok: b.ok, id: b.results[0]?.id, reason: b.results.find((r) => !r.ok)?.reason };
    for (const r of b.results) {
      await db.from("aa_messages").insert({ lead_id: lead.id, direction: "outbound", body: r.body, external_id: r.id ?? null, meta: { sent_ok: r.ok, reason: r.reason } });
    }
  }

  // Aplica status/decisÃµes
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
    // Cancelamento definitivo: cancela a reuniÃ£o no Calendly via API (sem deixar slot ocupado).
    if (newStatus === "reuniao_cancelada" && appt?.calendly_event_id) {
      const ok = await cancelCalendlyEvent(appt.calendly_event_id, "Cancelado a pedido do lead via WhatsApp");
      await db.from("aa_appointments").update({ status: "cancelada", confirmation_status: "recusada" })
        .eq("lead_id", lead.id).neq("status", "cancelada");
      await addHistory(db, lead.id, "calendly", `ReuniÃ£o cancelada no Calendly via API (${ok ? "ok" : "falha"}).`);
    }
  }

  // Avisa o Gabriel se necessÃ¡rio
  if (decision.notify_gabriel) {
    const gabriel = Deno.env.get("GABRIEL_WHATSAPP_NUMBER");
    const msg = decision.gabriel_message ?? `Atendimento do lead ${lead.name} precisa da sua atenÃ§Ã£o.`;
    if (gabriel) {
      const g = await sendText(gabriel, msg);
      await addHistory(db, lead.id, "gabriel_notified", msg, { sent_ok: g.ok, reason: g.reason });
    } else {
      await addHistory(db, lead.id, "gabriel_notify_skipped", "GABRIEL_WHATSAPP_NUMBER nÃ£o configurado.", { msg });
    }
  }

  return json({ ok: true, lead_id: lead.id, status: newStatus, replied: sent.ok });
});
