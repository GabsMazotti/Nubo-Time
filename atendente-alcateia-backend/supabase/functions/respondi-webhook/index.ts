// Entrada do lead vindo do formulário Respondi.
// Fluxo: normaliza telefone -> dedup -> salva lead -> 1ª mensagem (WhatsApp) -> agenda follow-ups.
import { admin, addHistory } from "../_shared/db.ts";
import { json } from "../_shared/cors.ts";
import { normalizePhone } from "../_shared/phone.ts";
import { parseBudget, initialTemperature } from "../_shared/qualification.ts";
import { callBrain } from "../_shared/anthropic.ts";
import { sendBlocks } from "../_shared/zapi.ts";
import { extractCalendlyEventUuid, fetchCalendlyEventStart } from "../_shared/calendly.ts";
import { REMINDER_TYPES } from "../_shared/pipeline.ts";
import { formatDataHora, formatDiaHora } from "../_shared/util.ts";
import { funnelContext, normFunnel } from "../_shared/config.ts";

// Mapeia campos do Respondi (nomes variam) para o nosso modelo.
function pick(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of Object.keys(obj)) {
    const norm = k.toLowerCase();
    if (keys.some((t) => norm.includes(t))) {
      const v = obj[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  return undefined;
}

// Igual ao pick, mas retorna o valor CRU (string, objeto, array...) — usado para o telefone,
// que pode chegar como objeto (causa do bug [object Object]).
function pickRaw(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of Object.keys(obj)) {
    const norm = k.toLowerCase();
    if (keys.some((t) => norm.includes(t))) {
      const v = obj[k];
      if (v != null && v !== "") return v;
    }
  }
  return undefined;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // Validação opcional por segredo (?secret=...)
  const secret = Deno.env.get("RESPONDI_WEBHOOK_SECRET");
  if (secret) {
    const url = new URL(req.url);
    if (url.searchParams.get("secret") !== secret) return json({ error: "unauthorized" }, 401);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const db = admin();
  // Funil deste formulário: ?funnel=mentoria no webhook -> mentoria; senão -> alcateia (default seguro).
  const funnel = normFunnel(new URL(req.url).searchParams.get("funnel"));
  // Contexto do funil: mensagens-padrão, persona e Calendly do funil CERTO (nunca cruza).
  const fctx = await funnelContext(funnel);
  const T = fctx.templates;

  // --- Extrai campos ---
  // Formato real do Respondi: { respondent: { answers: { "Pergunta?": "Resposta", ... } } }.
  // Mantemos fallbacks para payloads achatados/variações.
  const respondent = (payload.respondent ?? {}) as Record<string, unknown>;
  const answers = (respondent.answers ?? {}) as Record<string, unknown>;
  const flat: Record<string, unknown> = {
    ...payload,
    ...(payload.data as object ?? {}),
    ...(payload.fields as object ?? {}),
    ...answers,
  };

  const name = pick(flat, ["nome", "name"]) ?? "tudo bem";
  const rawPhone = pickRaw(flat, ["whatsapp", "whats", "phone", "telefone", "celular", "fone", "tel"]);
  const email = pick(flat, ["email", "e-mail"]);
  const market = pick(flat, ["mercado", "atua"]);
  const role = pick(flat, ["você é", "voce e", "voce é", "papel", "perfil"]);
  const worksWith = pick(flat, ["trabalha com", "trabalha"]);
  const timeframe = pick(flat, ["tempo", "prazo", "preparado", "iniciar"]);
  // Orçamento: a pergunta-faixa contém "investimentos em"; evita casar com a pergunta de confirmação ("disponibilidade mínima").
  const budgetRaw = pick(flat, ["investimentos em", "disponibilidade mensal"]) ??
    pick(flat, ["investimento", "orçamento", "orcamento"]);
  // Calendly embutido no form (lead pode já ter agendado): captura o link, se houver.
  const calendlyLink = pickRaw(flat, ["calendly"]) ??
    (Object.values(flat).find((v) => typeof v === "string" && v.includes("calendly.com")) as string | undefined);

  // --- Telefone (resolve o bug [object Object]) ---
  const norm = normalizePhone(rawPhone);
  const range = parseBudget(budgetRaw);

  // --- Dedup por telefone ---
  // Se o lead já existe E já recebeu o 1º contato -> reenvio real, ignora.
  // Se já existe MAS ainda não foi contatado (ex.: criado pelo calendly-webhook na corrida do
  // formulário com Calendly embutido), NÃO ignora: reaproveita o lead, completa os dados do form
  // e segue para enviar a 1ª mensagem (senão o lead que agenda no form fica sem WhatsApp).
  let leadRow: Record<string, any> | null = null;
  if (norm.ok) {
    const { data: existing } = await db.from("aa_leads").select("*").eq("phone", norm.phone).maybeSingle();
    if (existing) {
      if (existing.first_contact_sent_at) {
        await addHistory(db, existing.id, "lead_received_duplicate", "Reenvio do formulário (lead já contatado).", { payload });
        return json({ ok: true, deduped: true, lead_id: existing.id });
      }
      // Completa os campos do form que o calendly-webhook não captura (mercado, orçamento, etc.).
      const merged: Record<string, any> = {
        market: existing.market ?? market ?? null,
        role: existing.role ?? role ?? null,
        works_with: existing.works_with ?? worksWith ?? null,
        start_timeframe: existing.start_timeframe ?? timeframe ?? null,
        budget_raw: existing.budget_raw ?? budgetRaw ?? null,
        budget_min: existing.budget_min ?? range.min,
        budget_max: existing.budget_max ?? range.max,
        email: existing.email ?? email ?? null,
        funnel: fctx.funnel,
        form_payload: payload,
      };
      await db.from("aa_leads").update(merged).eq("id", existing.id);
      leadRow = { ...existing, ...merged };
      await addHistory(db, existing.id, "lead_received", "Lead já existia sem 1º contato (corrida Calendly/form) — completando dados e enviando.", { payload });
    }
  }

  // --- Cria o lead (se ainda não existe) ---
  if (!leadRow) {
    const { data: created, error } = await db.from("aa_leads").insert({
      name,
      phone: norm.phone,
      phone_valid: norm.ok,
      phone_raw: rawPhone ?? null,
      email: email ?? null,
      market: market ?? null,
      role: role ?? null,
      works_with: worksWith ?? null,
      start_timeframe: timeframe ?? null,
      budget_raw: budgetRaw ?? null,
      budget_min: range.min,
      budget_max: range.max,
      temperature: initialTemperature(range),
      status: "novo_lead",
      funnel: fctx.funnel,
      form_payload: payload,
    }).select().single();
    if (error || !created) return json({ error: "db_insert_failed", detail: error?.message }, 500);
    leadRow = created;
    await addHistory(db, created.id, "lead_received", "Lead recebido via Respondi.", { telefone_normalizado: norm.phone, valido: norm.ok });
  }

  const lead = leadRow!;
  // --- Telefone inválido: não envia, sinaliza humano ---
  if (!norm.ok) {
    await db.from("aa_leads").update({ status: "precisa_humano", needs_human: true }).eq("id", lead.id);
    await addHistory(db, lead.id, "error", `Telefone inválido (${norm.reason}). Não foi possível enviar a 1ª mensagem.`, { raw: rawPhone });
    return json({ ok: true, lead_id: lead.id, warning: "telefone_invalido_handoff_humano" });
  }

  // --- O lead já agendou pelo Calendly (dentro do formulário)? ---
  let agendamento: Record<string, unknown> = { tem_reuniao: false };
  const eventUuid = extractCalendlyEventUuid(payload) ??
    (typeof calendlyLink === "string" ? extractCalendlyEventUuid(calendlyLink) : undefined);
  if (eventUuid) {
    const ev = await fetchCalendlyEventStart(eventUuid);
    const startTime = ev?.startTime;
    const { data: appt } = await db.from("aa_appointments").upsert({
      lead_id: lead.id,
      scheduled_at: startTime ?? null,
      status: "agendada",
      confirmation_status: "pendente",
      meeting_url: ev?.meetingUrl ?? null,
      source: "calendly",
      calendly_event_id: eventUuid,
    }, { onConflict: "calendly_event_id" }).select().single();
    await addHistory(db, lead.id, "calendly", `Lead já agendou no formulário${startTime ? ` para ${startTime}` : ""}.`, { event: eventUuid, startTime });
    agendamento = {
      tem_reuniao: true,
      quando: startTime ? formatDataHora(startTime) : "horário a confirmar",
      quando_iso: startTime ?? null,
    };
    if (startTime) {
      const start = new Date(startTime).getTime();
      // evita lembretes duplicados (o webhook do Calendly pode disparar para o mesmo evento)
      await db.from("aa_scheduled_tasks").update({ status: "canceled" })
        .eq("lead_id", lead.id).eq("status", "pending")
        .in("type", REMINDER_TYPES);
      const reminders = [
        { type: "meeting_confirmation_3h", at: start - 3 * 60 * 60_000 },
        { type: "meeting_confirmation_1h", at: start - 60 * 60_000 },
        { type: "meeting_confirmation_10min", at: start - 10 * 60_000 },
        { type: "meeting_noshow_check", at: start - 5 * 60_000 },
      ].filter((t) => t.at > Date.now());
      if (reminders.length) {
        await db.from("aa_scheduled_tasks").insert(reminders.map((t) => ({
          lead_id: lead.id, appointment_id: appt?.id ?? null, type: t.type,
          scheduled_for: new Date(t.at).toISOString(),
        })));
      }
    }
  }

  const jaAgendou = agendamento.tem_reuniao === true;
  // Preenchimento incompleto ("resposta recuperada" do Respondi): começou e não finalizou.
  const formStatus = String((respondent.status ?? "")).toLowerCase();
  const incompleto = !jaAgendou && formStatus !== "" && formStatus !== "completed" && formStatus !== "complete";

  // --- 1ª mensagem ---
  let firstMessage = "";
  if (jaAgendou) {
    // Lead JÁ marcou reunião -> mensagem PADRÃO do Gabriel (sem cérebro), com a data/hora.
    const quando = agendamento.quando_iso ? formatDiaHora(String(agendamento.quando_iso)) : "";
    firstMessage = T.confirmacaoGabriel(name, quando);
    await db.from("aa_leads").update({
      status: "call_agendada", temperature: "quente", stage: "reuniao_marcada", stage_changed_at: new Date().toISOString(),
      first_contact_sent_at: new Date().toISOString(), last_outbound_at: new Date().toISOString(),
    }).eq("id", lead.id);
  } else if ((range.min ?? 0) >= fctx.outreachFloor) {
    // Tem o orçamento mínimo do funil e NÃO agendou -> mensagem PADRÃO de abordagem (sem cérebro).
    // qualified=true a partir do piso de qualificação do funil (Alcateia R$10k · Mentoria R$5k).
    firstMessage = T.gabrielQualificado(name);
    const jaQualificado = (range.min ?? 0) >= fctx.qualifyFloor;
    await db.from("aa_leads").update({
      status: "contato_realizado", temperature: initialTemperature(range),
      qualified: jaQualificado,
      qualified_at: jaQualificado ? new Date().toISOString() : null,
      stage: "primeiro_contato", stage_changed_at: new Date().toISOString(),
      first_contact_sent_at: new Date().toISOString(), last_outbound_at: new Date().toISOString(),
    }).eq("id", lead.id);
  } else {
    // Não agendou e sem orçamento mínimo -> atendente de remarketing/abordagem (cérebro) decide.
    try {
      const decision = await callBrain({
        lead: { ...lead, agendamento, formulario_incompleto: incompleto },
        conversation: [],
        personaPrompt: fctx.personas.remarketing,
        situation: incompleto
          ? "Primeiro contato com um lead que COMEÇOU o nosso formulário mas NÃO finalizou (resposta recuperada/parcial). Na 1ª mensagem: (1) deixe claro quem você é logo no início, conforme a SUA persona; (2) faça uma BREVE apresentação (1 frase) do que você oferece; (3) relembre que ele estava preenchendo nosso formulário e use os dados que ele já preencheu, se houver; (4) com leveza, comente que viu que ele não finalizou e pergunte o que aconteceu / como pode ajudar. Curto e natural, conduzindo pra call quando fizer sentido. Status: contato_realizado."
          : "Primeiro contato. O lead concluiu o formulário e ainda NÃO respondeu nem agendou. Escreva a 1ª mensagem personalizada conduzindo a conversa (status: contato_realizado).",
      });
      firstMessage = decision.reply;
      await db.from("aa_leads").update({
        status: "contato_realizado", temperature: decision.temperature,
        stage: "primeiro_contato", stage_changed_at: new Date().toISOString(),
        first_contact_sent_at: new Date().toISOString(), last_outbound_at: new Date().toISOString(),
      }).eq("id", lead.id);
    } catch (e) {
      await addHistory(db, lead.id, "error", `Falha ao gerar 1ª mensagem: ${(e as Error).message}`);
      return json({ ok: true, lead_id: lead.id, warning: "falha_brain", detail: (e as Error).message });
    }
  }

  // --- Envia via Z-API (em BLOCOS, cada parágrafo vira uma mensagem) ---
  const sent = await sendBlocks(norm.phone!, firstMessage);
  for (const r of sent.results) {
    await db.from("aa_messages").insert({ lead_id: lead.id, direction: "outbound", body: r.body, external_id: r.id ?? null, meta: { kind: "first_contact", sent_ok: r.ok, reason: r.reason } });
  }
  await addHistory(db, lead.id, "first_contact_sent", firstMessage, { sent_ok: sent.ok });

  // --- Follow-ups: só se NÃO agendou (para tentar engajar quem não respondeu) ---
  if (!jaAgendou) {
    const now = Date.now();
    await db.from("aa_scheduled_tasks").insert([
      { lead_id: lead.id, type: "followup_first_contact_30min", scheduled_for: new Date(now + 30 * 60_000).toISOString() },
      { lead_id: lead.id, type: "followup_first_contact_4h", scheduled_for: new Date(now + 4 * 3600_000).toISOString() },
      { lead_id: lead.id, type: "followup_first_contact_next_day", scheduled_for: new Date(now + 24 * 3600_000).toISOString() },
    ]);
  }

  return json({ ok: true, lead_id: lead.id, first_message_sent: sent.ok, ja_agendou: jaAgendou });
});
