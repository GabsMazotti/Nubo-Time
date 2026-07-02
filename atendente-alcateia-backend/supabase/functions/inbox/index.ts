// API JSON da inbox (protegida por ?key=PANEL_KEY). O Supabase bloqueia servir text/html
// direto da function, então o HTML/render fica em painel/inbox.html (consome esta API).
import { admin, addHistory } from "../_shared/db.ts";
import { sendText } from "../_shared/zapi.ts";
import { funnelDefaults, loadConfig } from "../_shared/config.ts";
import { STATUS, STATUS_LABEL } from "../_shared/pipeline.ts";
import { STAGE_DEFAULTS } from "../_shared/stages.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function jsonR(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  const PANEL_KEY = Deno.env.get("PANEL_KEY");
  if (!PANEL_KEY || url.searchParams.get("key") !== PANEL_KEY) return jsonR({ error: "unauthorized" }, 401);

  const db = admin();
  const sel = url.searchParams.get("lead");

  // --- Config editável (prompt/inteligência dos atendentes) ---
  if (req.method === "GET" && url.searchParams.get("config")) {
    const fd = funnelDefaults(url.searchParams.get("funnel"));
    const stored = await loadConfig(fd.funnel);
    const effective: Record<string, string> = {};
    for (const k of Object.keys(fd.defaults)) effective[k] = stored[k] ?? fd.defaults[k];
    return jsonR({ config: effective, defaults: fd.defaults, funnel: fd.funnel, faq_keys: fd.faqKeys });
  }

  // --- Estado do interruptor GLOBAL (bot ligado/desligado por completo) ---
  if (req.method === "GET" && url.searchParams.get("global_pause")) {
    const { data } = await db.from("aa_config").select("value").eq("key", "bot_paused_global").limit(1);
    return jsonR({ paused: String(data?.[0]?.value ?? "").toLowerCase() === "true" });
  }

  // --- Etapas do funil + gatilhos (palavras que marcam a etapa) ---
  if (req.method === "GET" && url.searchParams.get("stages")) {
    const { data: stages } = await db.from("aa_stages").select("*").order("sort_order", { ascending: true });
    const { data: rules } = await db.from("aa_stage_rules").select("*").order("priority", { ascending: false });
    return jsonR({
      stages: (stages && stages.length) ? stages : STAGE_DEFAULTS,
      rules: rules ?? [],
      status_options: STATUS.map((s) => ({ value: s, label: STATUS_LABEL[s] })),
    });
  }

  // --- Ações de escrita (enviar mensagem manual / pausar-reativar o bot) ---
  if (req.method === "POST") {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    if (body.action === "send" && body.lead_id && body.text) {
      const { data: lead } = await db.from("aa_leads").select("id,phone").eq("id", body.lead_id).maybeSingle();
      if (!lead?.phone) return jsonR({ error: "lead_sem_telefone" }, 400);
      const sent = await sendText(lead.phone, String(body.text));
      await db.from("aa_messages").insert({ lead_id: lead.id, direction: "outbound", body: String(body.text), external_id: sent.id ?? null, meta: { kind: "manual", sent_ok: sent.ok, reason: sent.reason } });
      await db.from("aa_leads").update({ bot_paused: true, last_outbound_at: new Date().toISOString() }).eq("id", lead.id);
      await addHistory(db, lead.id, "manual_message", String(body.text), { sent_ok: sent.ok, reason: sent.reason });
      return jsonR({ ok: sent.ok, reason: sent.reason, bot_paused: true });
    }
    if (body.action === "save_config" && body.config && typeof body.config === "object") {
      // Salva só chaves conhecidas do FUNIL (evita lixo). Valor vazio/igual ao default = apaga o override.
      const fd = funnelDefaults(body.funnel as string | undefined);
      const incoming = body.config as Record<string, unknown>;
      let saved = 0;
      for (const k of Object.keys(fd.defaults)) {
        if (!(k in incoming)) continue;
        const value = String(incoming[k] ?? "").trim();
        if (value === "" || value === fd.defaults[k].trim()) {
          await db.from("aa_config").delete().eq("funnel", fd.funnel).eq("key", k); // sem override -> usa default
        } else {
          await db.from("aa_config").upsert({ funnel: fd.funnel, key: k, value }, { onConflict: "funnel,key" });
        }
        saved++;
      }
      return jsonR({ ok: true, saved, funnel: fd.funnel });
    }
    if (body.action === "save_stages") {
      // Salva o catálogo de etapas (upsert por key) e SUBSTITUI o conjunto de gatilhos.
      const stages = Array.isArray(body.stages) ? body.stages as Record<string, unknown>[] : [];
      const rules = Array.isArray(body.rules) ? body.rules as Record<string, unknown>[] : [];
      for (const s of stages) {
        if (!s || !s.key) continue;
        await db.from("aa_stages").upsert({
          key: String(s.key),
          label: String(s.label ?? s.key),
          sort_order: Number(s.sort_order ?? 0),
          status: String(s.status ?? "em_atendimento"),
          color: s.color ? String(s.color) : null,
          is_active: s.is_active !== false,
        }, { onConflict: "key" });
      }
      await db.from("aa_stage_rules").delete().gt("id", 0); // troca o conjunto inteiro de gatilhos
      const toInsert = rules.filter((r) => r && r.stage_key && r.pattern).map((r) => ({
        stage_key: String(r.stage_key),
        direction: ["inbound", "outbound", "any"].includes(String(r.direction)) ? String(r.direction) : "inbound",
        match_type: r.match_type === "regex" ? "regex" : "contains",
        pattern: String(r.pattern),
        priority: Number(r.priority ?? 100),
        is_active: r.is_active !== false,
      }));
      if (toInsert.length) await db.from("aa_stage_rules").insert(toInsert);
      return jsonR({ ok: true, stages: stages.length, rules: toInsert.length });
    }
    if (body.action === "toggle_bot" && body.lead_id) {
      const paused = !!body.paused;
      await db.from("aa_leads").update({ bot_paused: paused }).eq("id", body.lead_id);
      await addHistory(db, body.lead_id as string, "bot_toggle", paused ? "Bot pausado (humano assumiu)." : "Bot reativado.");
      return jsonR({ ok: true, bot_paused: paused });
    }
    if (body.action === "set_global_pause") {
      // Liga/desliga o bot POR COMPLETO (kill switch global).
      const paused = !!body.paused;
      await db.from("aa_config").upsert({ funnel: "alcateia", key: "bot_paused_global", value: paused ? "true" : "false" }, { onConflict: "funnel,key" });
      return jsonR({ ok: true, paused });
    }
    return jsonR({ error: "acao_desconhecida" }, 400);
  }

  // Thread de um lead específico
  if (sel) {
    const { data: lead } = await db.from("aa_leads").select("*").eq("id", sel).maybeSingle();
    if (!lead) return jsonR({ error: "not_found" }, 404);
    const { data: messages } = await db.from("aa_messages")
      .select("direction,body,created_at").eq("lead_id", sel).order("created_at", { ascending: true });
    const { data: appointment } = await db.from("aa_appointments")
      .select("scheduled_at,status,confirmation_status").eq("lead_id", sel)
      .neq("status", "cancelada").order("scheduled_at", { ascending: false }).limit(1).maybeSingle();
    return jsonR({ lead, messages: messages ?? [], appointment: appointment ?? null });
  }

  // Lista de conversas / leads (com última mensagem para preview/ordenação e dados p/ o CRM)
  const { data: leads } = await db.from("aa_leads")
    .select("id,name,phone,status,stage,temperature,needs_human,qualified,qualified_no_meeting,remarketing,budget_raw,budget_min,budget_max,market,role,email,bot_paused,created_at,last_inbound_at,last_outbound_at")
    .limit(500);
  const { data: recent } = await db.from("aa_messages")
    .select("lead_id,direction,body,created_at").order("created_at", { ascending: false }).limit(1200);
  const lastByLead = new Map<string, { body: string; direction: string; created_at: string }>();
  for (const m of (recent ?? [])) if (!lastByLead.has(m.lead_id)) lastByLead.set(m.lead_id, m);

  // Agendamento ativo (não cancelado) por lead — para o card do CRM mostrar a reunião.
  const { data: appts } = await db.from("aa_appointments")
    .select("lead_id,scheduled_at,status,confirmation_status").neq("status", "cancelada")
    .order("scheduled_at", { ascending: false });
  const apptByLead = new Map<string, { scheduled_at: string; status: string; confirmation_status: string }>();
  for (const a of (appts ?? [])) if (!apptByLead.has(a.lead_id)) apptByLead.set(a.lead_id, a);

  const items = (leads ?? []).map((l) => {
    const lm = lastByLead.get(l.id);
    const activity = lm?.created_at ?? l.last_inbound_at ?? l.last_outbound_at ?? l.created_at;
    return {
      id: l.id, name: l.name, phone: l.phone, status: l.status, stage: l.stage, temperature: l.temperature,
      needs_human: l.needs_human, qualified: l.qualified, qualified_no_meeting: l.qualified_no_meeting, remarketing: l.remarketing,
      budget_raw: l.budget_raw,
      budget_min: l.budget_min, budget_max: l.budget_max, market: l.market, role: l.role, email: l.email,
      bot_paused: l.bot_paused, created_at: l.created_at,
      appt: apptByLead.get(l.id) ?? null,
      last: lm ? { body: lm.body, direction: lm.direction, created_at: lm.created_at } : null, activity,
    };
  }).sort((a, b) => String(b.activity).localeCompare(String(a.activity)));

  return jsonR({ leads: items, total: items.length });
});
