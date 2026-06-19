// Entrada do lead vindo do formulÃ¡rio Respondi.
// Fluxo: normaliza telefone -> dedup -> salva lead -> 1Âª mensagem (WhatsApp) -> agenda follow-ups.
import { admin, addHistory } from "../_shared/db.ts";
import { json } from "../_shared/cors.ts";
import { normalizePhone } from "../_shared/phone.ts";
import { parseBudget, initialTemperature, QUALIFY_FLOOR, OUTREACH_FLOOR } from "../_shared/qualification.ts";
import { callBrain } from "../_shared/anthropic.ts";
import { sendBlocks } from "../_shared/zapi.ts";
import { extractCalendlyEventUuid, fetchCalendlyEventStart } from "../_shared/calendly.ts";
import { formatDataHora, formatDiaHora } from "../_shared/util.ts";
import { PERSONA_REMARKETING, TEMPLATES } from "../_shared/persona.ts";

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

// Igual ao pick, mas retorna o valor CRU (string, objeto, array...) â€” usado para o telefone,
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

  // ValidaÃ§Ã£o opcional por segredo (?secret=...)
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

  // --- Extrai campos ---
  // Formato real do Respondi: { respondent: { answers: { "Pergunta?": "Resposta", ... } } }.
  // Mantemos fallbacks para payloads achatados/variaÃ§Ãµes.
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
  const role = pick(flat, ["vocÃª Ã©", "voce e", "voce Ã©", "papel", "perfil"]);
  const worksWith = pick(flat, ["trabalha com", "trabalha"]);
  const timeframe = pick(flat, ["tempo", "prazo", "preparado", "iniciar"]);
  // OrÃ§amento: a pergunta-faixa contÃ©m "investimentos em"; evita casar com a pergunta de confirmaÃ§Ã£o ("disponibilidade mÃ­nima").
  const budgetRaw = pick(flat, ["investimentos em", "disponibilidade mensal"]) ??
    pick(flat, ["investimento", "orÃ§amento", "orcamento"]);
  // Calendly embutido no form (lead pode jÃ¡ ter agendado): captura o link, se houver.
  const calendlyLink = pickRaw(flat, ["calendly"]) ??
    (Object.values(flat).find((v) => typeof v === "string" && v.includes("calendly.com")) as string | undefined);

  // --- Telefone (resolve o bug [object Object]) ---
  const norm = normalizePhone(rawPhone);
  const range = parseBudget(budgetRaw);

  // --- Dedup por telefone ---
  if (norm.ok) {
    const { data: existing } = await db.from("aa_leads").select("id, first_contact_sent_at").eq("phone", norm.phone).maybeSingle();
    if (existing) {
      await addHistory(db, existing.id, "lead_received_duplicate", "Reenvio do formulÃ¡rio (lead jÃ¡ existe).", { payload });
      return json({ ok: true, deduped: true, lead_id: existing.id });
    }
  }

  // --- Cria o lead ---
  const { data: lead, error } = await db.from("aa_leads").insert({
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
    form_payload: payload,
  }).select().single();

  if (error || !lead) return json({ error: "db_insert_failed", detail: error?.message }, 500);

  await addHistory(db, lead.id, "lead_received", "Lead recebido via Respondi.", { telefone_normalizado: norm.phone, valido: norm.ok });
  // --- Telefone invÃ¡lido: nÃ£o envia, sinaliza humano ---
  if (!norm.ok) {
    await db.from("aa_leads").update({ status: "precisa_humano", needs_human: true }).eq("id", lead.id);
    await addHistory(db, lead.id, "error", `Telefone invÃ¡lido (${norm.reason}). NÃ£o foi possÃ­vel enviar a 1Âª mensagem.`, { raw: rawPhone });
    return json({ ok: true, lead_id: lead.id, warning: "telefone_invalido_handoff_humano" });
  }

  // --- O lead jÃ¡ agendou pelo Calendly (dentro do formulÃ¡rio)? ---
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
    await addHistory(db, lead.id, "calendly", `Lead jÃ¡ agendou no formulÃ¡rio${startTime ? ` para ${startTime}` : ""}.`, { event: eventUuid, startTime });
    agendamento = {
      tem_reuniao: true,
      quando: startTime ? formatDataHora(startTime) : "horÃ¡rio a confirmar",
      quando_iso: startTime ?? null,
    };
    if (startTime) {
      const start = new Date(startTime).getTime();
      // evita lembretes duplicados (o webhook do Calendly pode disparar para o mesmo evento)
      await db.from("aa_scheduled_tasks").update({ status: "canceled" })
        .eq("lead_id", lead.id).eq("status", "pending")
        .in("type", ["meeting_confirmation_1h", "meeting_confirmation_30min", "meeting_noshow_check"]);
      const reminders = [
        { type: "meeting_confirmation_1h", at: start - 60 * 60_000 },
        { type: "meeting_confirmation_30min", at: start - 30 * 60_000 },
        { type: "meeting_noshow_check", at: start - 15 * 60_000 },
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
  // Preenchimento incompleto ("resposta recuperada" do Respondi): comeÃ§ou e nÃ£o finalizou.
  const formStatus = String((respondent.status ?? "")).toLowerCase();
  const incompleto = !jaAgendou && formStatus !== "" && formStatus !== "completed" && formStatus !== "complete";

  // --- 1Âª mensagem ---
  let firstMessage = "";
  if (jaAgendou) {
    // Lead JÃ marcou reuniÃ£o -> mensagem PADRÃƒO do Gabriel (sem cÃ©rebro), com a data/hora.
    const quando = agendamento.quando_iso ? formatDiaHora(String(agendamento.quando_iso)) : "";
    firstMessage = TEMPLATES.confirmacaoGabriel(name, quando);
    await db.from("aa_leads").update({
      status: "call_agendada", temperature: "quente",
      first_contact_sent_at: new Date().toISOString(), last_outbound_at: new Date().toISOString(),
    }).eq("id", lead.id);
  } else if ((range.min ?? 0) >= OUTREACH_FLOOR) {
    // Tem orÃ§amento mÃ­nimo (>= R$5k) e NÃƒO agendou -> mensagem PADRÃƒO de abordagem do Gabriel (sem cÃ©rebro).
    // qualified=true sÃ³ a partir de R$10k; faixa 5â€“10k entra como "morno" (confirma na conversa).
    firstMessage = TEMPLATES.gabrielQualificado(name);
    await db.from("aa_leads").update({
      status: "contato_realizado", temperature: initialTemperature(range),
      qualified: (range.min ?? 0) >= QUALIFY_FLOOR,
      first_contact_sent_at: new Date().toISOString(), last_outbound_at: new Date().toISOString(),
    }).eq("id", lead.id);
  } else {
    // NÃ£o agendou e sem orÃ§amento mÃ­nimo -> atendente de remarketing/abordagem (cÃ©rebro) decide.
    try {
      const decision = await callBrain({
        lead: { ...lead, agendamento, formulario_incompleto: incompleto },
        conversation: [],
        personaPrompt: PERSONA_REMARKETING,
        situation: incompleto
          ? "Primeiro contato com um lead que COMEÃ‡OU o formulÃ¡rio da Alcateia Media mas NÃƒO finalizou (resposta recuperada/parcial). Na 1Âª mensagem: (1) deixe CLARO logo no inÃ­cio que vocÃª Ã© da ALCATEIA MEDIA; (2) faÃ§a uma BREVE apresentaÃ§Ã£o (1 frase) do que a Alcateia faz â€” estrutura e trÃ¡fego pago para operaÃ§Ãµes de iGaming/apostas; (3) RELEMBRE que ele estava preenchendo nosso formulÃ¡rio e qual era o objetivo dele (estruturar/escalar a operaÃ§Ã£o no iGaming) â€” use os dados que ele jÃ¡ preencheu, se houver; (4) com leveza, comente que viu que ele nÃ£o finalizou e pergunte o que aconteceu / como pode ajudar. Curto e natural, conduzindo pra call com o Gabriel quando fizer sentido. Status: contato_realizado."
          : "Primeiro contato. O lead concluiu o formulÃ¡rio e ainda NÃƒO respondeu nem agendou. Escreva a 1Âª mensagem personalizada conduzindo a conversa (status: contato_realizado).",
      });
      firstMessage = decision.reply;
      await db.from("aa_leads").update({
        status: "contato_realizado", temperature: decision.temperature,
        first_contact_sent_at: new Date().toISOString(), last_outbound_at: new Date().toISOString(),
      }).eq("id", lead.id);
    } catch (e) {
      await addHistory(db, lead.id, "error", `Falha ao gerar 1Âª mensagem: ${(e as Error).message}`);
      return json({ ok: true, lead_id: lead.id, warning: "falha_brain", detail: (e as Error).message });
    }
  }

  // --- Envia via Z-API (em BLOCOS, cada parÃ¡grafo vira uma mensagem) ---
  const sent = await sendBlocks(norm.phone!, firstMessage);
  for (const r of sent.results) {
    await db.from("aa_messages").insert({ lead_id: lead.id, direction: "outbound", body: r.body, external_id: r.id ?? null, meta: { kind: "first_contact", sent_ok: r.ok, reason: r.reason } });
  }
  await addHistory(db, lead.id, "first_contact_sent", firstMessage, { sent_ok: sent.ok });

  // --- Follow-ups: sÃ³ se NÃƒO agendou (para tentar engajar quem nÃ£o respondeu) ---
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
