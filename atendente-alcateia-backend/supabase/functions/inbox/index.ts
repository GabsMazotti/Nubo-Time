// API JSON da inbox (protegida por ?key=PANEL_KEY). O Supabase bloqueia servir text/html
// direto da function, entÃ£o o HTML/render fica em painel/inbox.html (consome esta API).
import { admin, addHistory } from "../_shared/db.ts";
import { sendText } from "../_shared/zapi.ts";

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

  // --- AÃ§Ãµes de escrita (enviar mensagem manual / pausar-reativar o bot) ---
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
    if (body.action === "toggle_bot" && body.lead_id) {
      const paused = !!body.paused;
      await db.from("aa_leads").update({ bot_paused: paused }).eq("id", body.lead_id);
      await addHistory(db, body.lead_id as string, "bot_toggle", paused ? "Bot pausado (humano assumiu)." : "Bot reativado.");
      return jsonR({ ok: true, bot_paused: paused });
    }
    return jsonR({ error: "acao_desconhecida" }, 400);
  }

  // Thread de um lead especÃ­fico
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

  // Lista de conversas / leads (com Ãºltima mensagem para preview/ordenaÃ§Ã£o e dados p/ o CRM)
  const { data: leads } = await db.from("aa_leads")
    .select("id,name,phone,status,temperature,needs_human,qualified,budget_raw,budget_min,budget_max,market,role,email,bot_paused,created_at,last_inbound_at,last_outbound_at")
    .limit(500);
  const { data: recent } = await db.from("aa_messages")
    .select("lead_id,direction,body,created_at").order("created_at", { ascending: false }).limit(1200);
  const lastByLead = new Map<string, { body: string; direction: string; created_at: string }>();
  for (const m of (recent ?? [])) if (!lastByLead.has(m.lead_id)) lastByLead.set(m.lead_id, m);

  // Agendamento ativo (nÃ£o cancelado) por lead â€” para o card do CRM mostrar a reuniÃ£o.
  const { data: appts } = await db.from("aa_appointments")
    .select("lead_id,scheduled_at,status,confirmation_status").neq("status", "cancelada")
    .order("scheduled_at", { ascending: false });
  const apptByLead = new Map<string, { scheduled_at: string; status: string; confirmation_status: string }>();
  for (const a of (appts ?? [])) if (!apptByLead.has(a.lead_id)) apptByLead.set(a.lead_id, a);

  const items = (leads ?? []).map((l) => {
    const lm = lastByLead.get(l.id);
    const activity = lm?.created_at ?? l.last_inbound_at ?? l.last_outbound_at ?? l.created_at;
    return {
      id: l.id, name: l.name, phone: l.phone, status: l.status, temperature: l.temperature,
      needs_human: l.needs_human, qualified: l.qualified, budget_raw: l.budget_raw,
      budget_min: l.budget_min, budget_max: l.budget_max, market: l.market, role: l.role, email: l.email,
      bot_paused: l.bot_paused, created_at: l.created_at,
      appt: apptByLead.get(l.id) ?? null,
      last: lm ? { body: lm.body, direction: lm.direction, created_at: lm.created_at } : null, activity,
    };
  }).sort((a, b) => String(b.activity).localeCompare(String(a.activity)));

  return jsonR({ leads: items, total: items.length });
});
