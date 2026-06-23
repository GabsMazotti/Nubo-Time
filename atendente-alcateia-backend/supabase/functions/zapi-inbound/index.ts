// Respostas do lead no WhatsApp (webhook "on-message-received" da Z-API).
// Fluxo: dedup -> salva inbound -> (responde 200 já) -> espera 25s -> debounce -> cérebro decide -> responde.
import { admin, addHistory } from "../_shared/db.ts";
import { json } from "../_shared/cors.ts";
import { parseInbound, sendBlocks, sendText } from "../_shared/zapi.ts";
import { callBrain } from "../_shared/anthropic.ts";
import { isValidStatus, REMINDER_TYPES } from "../_shared/pipeline.ts";
import { evaluateStage, loadStageRules, loadStages, syncRemarketing } from "../_shared/stages.ts";
import { QUALIFY_FLOOR } from "../_shared/qualification.ts";
import { buildPersonas, buildTemplates, CALENDLY_URL, TEMPLATES } from "../_shared/persona.ts";
import { loadConfig } from "../_shared/config.ts";
import { formatDataHora, formatDiaHora } from "../_shared/util.ts";
import { cancelCalendlyEvent } from "../_shared/calendly.ts";

// Espera antes de responder o lead (só ao responder mensagem recebida; deixa a conversa mais humana).
const REPLY_DELAY_MS = 25_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Variações do telefone com/sem o 9º dígito (BR), pra casar o lead mesmo se a Z-API formatar diferente. */
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

/** Intenção clara de remarcar/não conseguir no horário (rede de segurança p/ leads já agendados). */
function wantsReschedule(text?: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase();
  return /(remarc|reagend|adiar|n[ãa]o vou conseguir|n[ãa]o vou poder|n[ãa]o consigo nesse|outro hor[áa]rio|outro dia|mudar o hor|trocar o hor|mudar a reuni|mudar a call|outro momento)/.test(t);
}

/**
 * Adiamento/negação/pergunta sobre confirmar DEPOIS — NÃO é confirmação de presença.
 * Ex.: "posso te confirmar em 1h?", "confirmo mais tarde", "ainda não consigo confirmar", "talvez".
 * Funciona como VETO: mesmo que o cérebro escorregue e marque confirmação, aqui a gente segura.
 */
function defersConfirm(text?: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase();
  return /(posso (te )?confirmar|vou confirmar|confirm(o|ar) (depois|mais tarde|em|daqui|amanh)|em uma hora|em 1 ?h\b|mais tarde|daqui a pouco|ainda n[ãa]o|n[ãa]o posso|n[ãa]o consigo|n[ãa]o sei se|talvez)/.test(t);
}

/**
 * Confirmação CLARA de presença na reunião (rede de segurança p/ leads com reunião pendente).
 * Removido o verbo solto "confirmar" e termos fracos ("certo"/"pode ser"/"perfeito") que geravam
 * falso-positivo. Se a frase adia/nega (defersConfirm), não conta como confirmação.
 */
function wantsConfirm(text?: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase();
  if (defersConfirm(t)) return false;
  return /(\bconfirmo\b|confirmad[oa]|t[ôo] dentro|estarei|vou sim|combinado|fechado|pode contar|isso mesmo|tudo certo|com certeza|claro que sim)/.test(t);
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

  // Acha o lead pelo telefone, tentando variações com/sem o 9º dígito (BR) por garantia.
  const { data: matches } = await db.from("aa_leads").select("*").in("phone", phoneVariants(phone)).limit(1);
  const lead = matches?.[0];
  if (!lead) return json({ ok: true, ignored: "lead_nao_encontrado", phone });

  if (lead.opted_out) return json({ ok: true, ignored: "opt_out" });

  // Dedup por id da mensagem (protege contra reenvio do webhook)
  if (inb.messageId) {
    const { data: dup } = await db.from("aa_messages").select("id").eq("external_id", inb.messageId).maybeSingle();
    if (dup) return json({ ok: true, deduped: true });
  }

  // Salva a mensagem recebida (cedo: aparece na inbox na hora e protege o dedup)
  const { data: inRow } = await db.from("aa_messages").insert({
    lead_id: lead.id, direction: "inbound",
    body: inb.text ?? (inb.isAudio ? "[áudio]" : inb.isMedia ? "[arquivo]" : "[mensagem]"),
    external_id: inb.messageId ?? null,
    meta: { isAudio: inb.isAudio, isMedia: inb.isMedia },
  }).select("created_at").single();
  const insertedAt = inRow?.created_at ?? new Date().toISOString();

  await db.from("aa_leads").update({
    last_inbound_at: new Date().toISOString(),
    status: ["novo_lead", "contato_realizado"].includes(lead.status) ? "em_atendimento" : lead.status,
  }).eq("id", lead.id);
  await addHistory(db, lead.id, "inbound", inb.text ?? "[mídia]", { isAudio: inb.isAudio, isMedia: inb.isMedia });

  // Bot pausado (humano assumiu a conversa pela inbox): registra a entrada e NÃO responde.
  if (lead.bot_paused) {
    await addHistory(db, lead.id, "inbound_paused", "Mensagem recebida — bot pausado (humano no controle).");
    return json({ ok: true, bot_paused: true });
  }

  // Lead respondeu -> cancela os follow-ups de primeiro contato pendentes
  await db.from("aa_scheduled_tasks").update({ status: "canceled" })
    .eq("lead_id", lead.id).eq("status", "pending")
    .in("type", ["followup_first_contact_30min", "followup_first_contact_4h", "followup_first_contact_next_day"]);

  // ---- Resposta com DELAY de 25s. Aguardamos dentro do handler (confiável); o dedup por messageId
  // protege contra eventual reenvio do webhook da Z-API durante a espera. ----
  {
    try {
      await sleep(REPLY_DELAY_MS);

      // Debounce: se o lead mandou outra mensagem nesses 25s, deixa a MAIS NOVA responder (evita resposta dupla).
      const { data: newer } = await db.from("aa_messages").select("id")
        .eq("lead_id", lead.id).eq("direction", "inbound").gt("created_at", insertedAt).limit(1);
      if (newer && newer.length) {
        await addHistory(db, lead.id, "reply_debounced", "Chegou mensagem mais nova do lead; resposta adiada para a última.");
        return json({ ok: true, debounced: true });
      }

      // Monta o histórico da conversa para o cérebro (já inclui as mensagens recebidas no intervalo)
      const { data: msgs } = await db.from("aa_messages").select("direction, body")
        .eq("lead_id", lead.id).order("created_at", { ascending: true }).limit(20);
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

      // Config editável (painel): monta persona e mensagens-padrão com overrides + fallback nos defaults.
      const cfg = await loadConfig();
      const personas = buildPersonas(cfg);
      const T = buildTemplates(cfg);

      // Escolhe o atendente de IA: CONFIRMAÇÃO (já agendou) x REMARKETING/abordagem (não agendou).
      const personaPrompt = agendamento.tem_reuniao ? personas.confirmacao : personas.remarketing;

      // Cérebro decide
      let decision;
      try {
        decision = await callBrain({
          lead: { ...lead, agendamento },
          conversation,
          personaPrompt,
          situation: inb.isAudio
            ? "O lead enviou um ÁUDIO e você NÃO consegue ouvir. Peça gentilmente que ele mande por TEXTO (needs_human=true, notify_gabriel=true, status precisa_humano). Não suma."
            : inb.isMedia
            ? "O lead enviou um ARQUIVO/MÍDIA que você não consegue abrir. Peça que ele descreva o essencial por TEXTO (needs_human=true, notify_gabriel=true, status precisa_humano). Não suma."
            : undefined,
        });
      } catch (e) {
        // Cérebro indisponível mesmo após os retries: NÃO deixa o lead no vácuo.
        await addHistory(db, lead.id, "error", `Falha no cérebro: ${(e as Error).message}`);
        try {
          await sendText(phone, "Opa! Recebi sua mensagem 🙌 Me dá um minutinho que já te respondo certinho.");
          await db.from("aa_messages").insert({ lead_id: lead.id, direction: "outbound", body: "Opa! Recebi sua mensagem 🙌 Me dá um minutinho que já te respondo certinho.", meta: { kind: "fallback_brain_fail" } });
        } catch { /* ignora erro de envio do fallback */ }
        const gabriel = Deno.env.get("GABRIEL_WHATSAPP_NUMBER");
        if (gabriel) {
          try { await sendText(gabriel, `⚠️ A IA falhou ao responder o lead ${lead.name ?? phone} (possível pico de uso). Dá uma olhada na inbox.`); } catch { /* ignora */ }
        }
        await db.from("aa_leads").update({ needs_human: true }).eq("id", lead.id);
        return json({ ok: true, warning: "falha_brain", fallback_sent: true });
      }

      // Mídia força handoff (segurança extra)
      if (inb.isAudio || inb.isMedia) { decision.needs_human = true; decision.status = "precisa_humano"; }

      const brainStatus = isValidStatus(decision.status) ? decision.status : lead.status;
      // Redes de segurança p/ leads que JÁ têm reunião (prioridade: remarcar > confirmar):
      const defers = defersConfirm(inb.text);
      const reschedule = agendamento.tem_reuniao === true && brainStatus !== "reuniao_cancelada" && wantsReschedule(inb.text);
      // Confirmação exige sinal claro E ausência de adiamento/negação. O veto `!defers` vale até
      // contra o cérebro: se o lead disse "posso confirmar em 1h?", NÃO confirmamos (não cancela
      // lembrete, não avisa o Gabriel) — deixa a IA responder naturalmente "claro, fico no aguardo".
      const confirm = agendamento.tem_reuniao === true && !reschedule && !defers && brainStatus !== "reuniao_cancelada" &&
        appt?.confirmation_status === "pendente" && (brainStatus === "call_confirmada" || wantsConfirm(inb.text));
      const newStatus = reschedule ? "remarcar_reuniao" : confirm ? "call_confirmada" : brainStatus;

      // Monta a resposta (determinística para remarcar/confirmar; senão usa o cérebro)
      let reply = decision.reply ?? "";
      if (newStatus === "remarcar_reuniao") {
        // Remarcação: reconhece + manda o link (evita pedir horário E mandar link juntos).
        const reschedUrl = Deno.env.get("CALENDLY_RESCHEDULE_URL") ?? CALENDLY_URL;
        reply = T.remarcacao((lead.name as string) ?? "tudo bem", reschedUrl);
      } else if (newStatus === "call_confirmada") {
        // Confirmação: resposta curta + 1 pergunta breve sobre a operação (sem explicar a call, sem duplicar).
        const quando = appt?.scheduled_at ? formatDiaHora(appt.scheduled_at) : (agendamento.quando as string ?? "");
        reply = T.confirmacaoFeita(quando);
      } else if (!agendamento.tem_reuniao && decision.send_calendly && reply && !reply.includes("calendly.com")) {
        // Só oferece o link de agendamento se o lead AINDA não tem reunião (não reoferecer a quem já agendou).
        reply += `\n\n${TEMPLATES.calendlyLine(CALENDLY_URL)}`;
      }

      // Envia a resposta ao lead — em BLOCOS (cada parágrafo é uma mensagem), pra soar natural.
      let sentOk = false;
      if (reply.trim()) {
        const b = await sendBlocks(phone, reply);
        sentOk = b.ok;
        for (const r of b.results) {
          await db.from("aa_messages").insert({ lead_id: lead.id, direction: "outbound", body: r.body, external_id: r.id ?? null, meta: { sent_ok: r.ok, reason: r.reason } });
        }
      }

      // Qualificação ESTÁVEL: uma vez qualificado (pelo cérebro, por já estar qualificado, ou por orçamento
      // de formulário >= R$10k) permanece qualificado — a não ser que seja explicitamente desqualificado.
      const desqualificado = ["nao_qualificado", "opt_out", "perdido"].includes(newStatus);
      const qualified = desqualificado
        ? false
        : (decision.qualified || lead.qualified === true || Number(lead.budget_min ?? 0) >= QUALIFY_FLOOR);
      const qualifiedAt = qualified ? (lead.qualified_at ?? new Date().toISOString()) : lead.qualified_at ?? null;

      // ── Etapa do funil (gatilho híbrido: palavras configuráveis + IA de reforço) ──
      // Uma palavra-gatilho que case na conversa marca a etapa; na faixa normal do funil
      // (até a agenda) ela também atualiza o status do CRM. Status de reunião/handoff ficam
      // a cargo da lógica viva acima (não são sobrescritos por palavra).
      const stages = await loadStages(db);
      const rules = await loadStageRules(db);
      const hasActiveAppt = agendamento.tem_reuniao === true && newStatus !== "reuniao_cancelada";
      const stageEval = evaluateStage({
        stages, rules,
        currentStage: lead.stage,
        inboundText: inb.text,
        outboundText: reply,
        aiStatus: newStatus,
        currentStatus: newStatus,
        hasActiveAppt,
      });
      const finalStatus = stageEval.status ?? newStatus;

      // Aplica status/decisões — CORE (colunas que sempre existem). Nunca pode falhar por causa da
      // feature de etapas: se a migration 0009 não estiver aplicada, o status do CRM ainda salva.
      await db.from("aa_leads").update({
        status: finalStatus,
        temperature: decision.temperature,
        qualified,
        needs_human: decision.needs_human || lead.needs_human,
        opted_out: newStatus === "opt_out" ? true : lead.opted_out,
        last_outbound_at: reply.trim() ? new Date().toISOString() : lead.last_outbound_at,
      }).eq("id", lead.id);

      // Colunas da feature de etapas (migration 0009) — best-effort, isolado: se a migration ainda
      // não tiver sido aplicada, isto falha sozinho sem congelar o CRM nem travar o atendimento.
      try {
        await db.from("aa_leads").update({
          qualified_at: qualifiedAt,
          ...(stageEval.changed && stageEval.stage ? { stage: stageEval.stage, stage_changed_at: new Date().toISOString() } : {}),
        }).eq("id", lead.id);
      } catch { /* migration 0009 ausente -> ignora (CRM segue funcionando) */ }
      if (stageEval.changed && stageEval.stage) {
        await db.from("aa_stage_history").insert({
          lead_id: lead.id, from_stage: lead.stage ?? null, to_stage: stageEval.stage,
          reason: stageEval.reason, rule_id: stageEval.ruleId ?? null,
        });
      }
      await addHistory(db, lead.id, "agent_decision", decision.history_note ?? reply, {
        status: finalStatus, stage: stageEval.stage, stage_reason: stageEval.reason,
        temperature: decision.temperature, qualified: decision.qualified,
        needs_human: decision.needs_human, send_calendly: decision.send_calendly, sent_ok: sentOk,
      });

      // Remarketing: mantém a fila de qualificados-sem-reunião e a coluna remarketing em dia.
      await syncRemarketing(db, { id: lead.id, qualified_at: qualifiedAt }, {
        stageKey: stageEval.stage,
        qualified,
        hasActiveAppt,
      });

      // Sincroniza o agendamento conforme o status decidido
      if (newStatus === "call_confirmada") {
        await db.from("aa_appointments").update({ confirmation_status: "confirmada", status: "confirmada" })
          .eq("lead_id", lead.id).neq("status", "cancelada");
        await db.from("aa_scheduled_tasks").update({ status: "canceled" })
          .eq("lead_id", lead.id).eq("status", "pending")
          .in("type", REMINDER_TYPES);
        // Avisa o Gabriel que o lead confirmou + FICHA de descoberta (pra ele entrar na call preparado).
        const gabriel = Deno.env.get("GABRIEL_WHATSAPP_NUMBER");
        if (gabriel) {
          const quandoF = appt?.scheduled_at ? formatDiaHora(appt.scheduled_at) : (agendamento.quando as string ?? "");
          const ficha = (decision.gabriel_message && decision.gabriel_message.trim())
            ? decision.gabriel_message.trim()
            : `✅ Lead confirmou presença!\nLead: ${lead.name} · ${quandoF}\nMercado: ${lead.market ?? "não informado"}\nJá rodou fora do Brasil: não informado\nNegociações disponíveis (afiliado): não informado`;
          const g = await sendText(gabriel, ficha);
          await addHistory(db, lead.id, "gabriel_notified", ficha, { kind: "confirmacao_presenca", sent_ok: g.ok });
        }
      } else if (newStatus === "remarcar_reuniao" || newStatus === "reuniao_cancelada") {
        await db.from("aa_scheduled_tasks").update({ status: "canceled" })
          .eq("lead_id", lead.id).eq("status", "pending")
          .in("type", REMINDER_TYPES);
        if (newStatus === "reuniao_cancelada" && appt?.calendly_event_id) {
          const ok = await cancelCalendlyEvent(appt.calendly_event_id, "Cancelado a pedido do lead via WhatsApp");
          await db.from("aa_appointments").update({ status: "cancelada", confirmation_status: "recusada" })
            .eq("lead_id", lead.id).neq("status", "cancelada");
          await addHistory(db, lead.id, "calendly", `Reunião cancelada no Calendly via API (${ok ? "ok" : "falha"}).`);
        }
      }

      // Avisa o Gabriel (sinal interno) — SÓ quando há real necessidade humana (evita aviso em venda normal,
      // ex.: agendar/qualificar lead de orçamento alto). Exige needs_human/precisa_humano junto.
      if (decision.notify_gabriel && (decision.needs_human || newStatus === "precisa_humano")) {
        const gabriel = Deno.env.get("GABRIEL_WHATSAPP_NUMBER");
        const msg = decision.gabriel_message ?? `Atendimento do lead ${lead.name} precisa da sua atenção.`;
        if (gabriel) {
          const g = await sendText(gabriel, msg);
          await addHistory(db, lead.id, "gabriel_notified", msg, { sent_ok: g.ok, reason: g.reason });
        } else {
          await addHistory(db, lead.id, "gabriel_notify_skipped", "GABRIEL_WHATSAPP_NUMBER não configurado.", { msg });
        }
      }
    } catch (e) {
      await addHistory(db, lead.id, "error", `Falha ao processar resposta: ${(e as Error).message}`);
    }
  }

  return json({ ok: true, lead_id: lead.id, replied: true });
});
