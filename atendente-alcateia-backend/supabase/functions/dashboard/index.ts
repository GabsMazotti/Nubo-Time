// Painel de acompanhamento (somente leitura), protegido por senha (?key=PANEL_KEY).
// Lista de leads + detalhe com conversa e histórico. Renderizado no servidor (usa service_role).
import { admin } from "../_shared/db.ts";

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

const TZ = Deno.env.get("TIMEZONE") ?? "America/Sao_Paulo";
function dt(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(iso));
  } catch { return iso; }
}

const TEMP_COLOR: Record<string, string> = { quente: "#ef4444", morno: "#f59e0b", frio: "#3b82f6" };
const STATUS_COLOR: Record<string, string> = {
  call_confirmada: "#22c55e", call_agendada: "#16a34a", qualificado: "#22c55e",
  em_atendimento: "#3b82f6", contato_realizado: "#64748b", novo_lead: "#64748b",
  precisa_humano: "#ef4444", risco_no_show: "#f97316", nao_confirmado: "#f97316",
  nao_qualificado: "#6b7280", sem_resposta: "#6b7280", perdido: "#6b7280", opt_out: "#6b7280",
  morno: "#f59e0b", nutricao: "#f59e0b", remarcar_reuniao: "#f59e0b", reuniao_remarcada: "#16a34a", reuniao_cancelada: "#6b7280",
};

function page(title: string, body: string): Response {
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="30">
<title>${esc(title)}</title>
<style>
  :root{color-scheme:dark}
  *{box-sizing:border-box}
  body{margin:0;background:#0b0f17;color:#e5e7eb;font:14px/1.5 system-ui,Segoe UI,Roboto,sans-serif}
  a{color:#60a5fa;text-decoration:none} a:hover{text-decoration:underline}
  .wrap{max-width:1100px;margin:0 auto;padding:24px}
  h1{font-size:20px;margin:0 0 4px} .sub{color:#94a3b8;margin:0 0 20px;font-size:13px}
  .cards{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px}
  .card{background:#111827;border:1px solid #1f2937;border-radius:10px;padding:14px 18px;min-width:120px}
  .card .n{font-size:24px;font-weight:700} .card .l{color:#94a3b8;font-size:12px}
  table{width:100%;border-collapse:collapse;background:#111827;border:1px solid #1f2937;border-radius:10px;overflow:hidden}
  th,td{text-align:left;padding:10px 12px;border-bottom:1px solid #1f2937;font-size:13px;vertical-align:top}
  th{color:#94a3b8;font-weight:600;background:#0f1623}
  tr:last-child td{border-bottom:none} tr:hover td{background:#0f1623}
  .badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;color:#fff}
  .msg{padding:10px 14px;border-radius:12px;margin:6px 0;max-width:75%;white-space:pre-wrap}
  .out{background:#1e3a5f;margin-left:auto} .in{background:#1f2937}
  .who{font-size:11px;color:#94a3b8;margin-bottom:8px}
  .hist{font-size:12px;color:#9ca3af;border-left:2px solid #1f2937;padding:4px 0 4px 12px;margin:2px 0}
  .back{margin-bottom:16px;display:inline-block}
  .empty{color:#6b7280;padding:24px;text-align:center}
</style></head><body><div class="wrap">${body}</div></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function badge(text: string, color: string): string {
  return `<span class="badge" style="background:${color}">${esc(text)}</span>`;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  const PANEL_KEY = Deno.env.get("PANEL_KEY");
  if (!PANEL_KEY || key !== PANEL_KEY) {
    return new Response("Acesso negado. Use ?key=SUA_SENHA", { status: 401 });
  }
  const db = admin();
  const leadId = url.searchParams.get("lead");
  const k = encodeURIComponent(PANEL_KEY);

  // ---------- Detalhe do lead ----------
  if (leadId) {
    const { data: lead } = await db.from("aa_leads").select("*").eq("id", leadId).maybeSingle();
    if (!lead) return page("Lead", `<a class="back" href="?key=${k}">← Voltar</a><div class="empty">Lead não encontrado.</div>`);
    const { data: appts } = await db.from("aa_appointments").select("scheduled_at,status,confirmation_status,meeting_url").eq("lead_id", leadId).order("scheduled_at", { ascending: false });
    const { data: msgs } = await db.from("aa_messages").select("direction,body,created_at").eq("lead_id", leadId).order("created_at", { ascending: true });
    const { data: hist } = await db.from("aa_lead_history").select("type,message,created_at").eq("lead_id", leadId).order("created_at", { ascending: true });

    const apptHtml = (appts ?? []).map((a) =>
      `<div class="hist">📅 ${dt(a.scheduled_at)} — ${esc(a.status)} / confirmação: ${esc(a.confirmation_status)}${a.meeting_url ? ` · <a href="${esc(a.meeting_url)}">link</a>` : ""}</div>`).join("") || `<div class="hist">Sem agendamento.</div>`;
    const convHtml = (msgs ?? []).map((m) =>
      `<div class="msg ${m.direction === "outbound" ? "out" : "in"}"><div class="who">${m.direction === "outbound" ? "🤖 Bot" : "👤 Lead"} · ${dt(m.created_at)}</div>${esc(m.body)}</div>`).join("") || `<div class="empty">Sem mensagens.</div>`;
    const histHtml = (hist ?? []).map((x) =>
      `<div class="hist"><b>${esc(x.type)}</b> · ${dt(x.created_at)}${x.message ? ` — ${esc(x.message)}` : ""}</div>`).join("");

    return page(`Lead ${lead.name}`, `
      <a class="back" href="?key=${k}">← Voltar para a lista</a>
      <h1>${esc(lead.name)} ${badge(lead.temperature ?? "—", TEMP_COLOR[lead.temperature] ?? "#6b7280")} ${badge(lead.status, STATUS_COLOR[lead.status] ?? "#6b7280")}</h1>
      <p class="sub">WhatsApp: ${esc(lead.phone) || "—"} · Mercado: ${esc(lead.market) || "—"} · Papel: ${esc(lead.role) || "—"} · Orçamento: ${esc(lead.budget_raw) || "—"} · Criado: ${dt(lead.created_at)}${lead.needs_human ? " · ⚠️ PRECISA DE HUMANO" : ""}</p>
      <div class="card" style="margin-bottom:16px"><div class="l">AGENDAMENTOS</div>${apptHtml}</div>
      <h1 style="font-size:16px">Conversa</h1>
      <div style="display:flex;flex-direction:column;margin-bottom:20px">${convHtml}</div>
      <h1 style="font-size:16px">Histórico</h1>
      ${histHtml || `<div class="empty">Sem histórico.</div>`}
    `);
  }

  // ---------- Lista de leads ----------
  const { data: leads } = await db.from("aa_leads")
    .select("id,name,phone,temperature,status,budget_raw,created_at,needs_human,qualified")
    .order("created_at", { ascending: false }).limit(200);
  const list = leads ?? [];
  const count = (f: (l: Record<string, unknown>) => boolean) => list.filter(f).length;
  const stats = [
    { l: "Total", n: list.length },
    { l: "Qualificados", n: count((l) => l.qualified === true) },
    { l: "Call agendada", n: count((l) => String(l.status).startsWith("call_")) },
    { l: "Precisa humano", n: count((l) => l.needs_human === true) },
    { l: "Quentes", n: count((l) => l.temperature === "quente") },
  ];

  const rows = list.map((l) => `<tr>
    <td><a href="?key=${k}&lead=${esc(l.id)}"><b>${esc(l.name)}</b></a></td>
    <td>${esc(l.phone) || "—"}</td>
    <td>${badge(String(l.temperature ?? "—"), TEMP_COLOR[String(l.temperature)] ?? "#6b7280")}</td>
    <td>${badge(String(l.status), STATUS_COLOR[String(l.status)] ?? "#6b7280")}</td>
    <td>${esc(l.budget_raw) || "—"}</td>
    <td>${dt(l.created_at as string)}</td>
  </tr>`).join("");

  return page("Atendente Alcateia — Leads", `
    <h1>🐺 Atendente Alcateia — Leads</h1>
    <p class="sub">Atualiza a cada 30s · ${list.length} leads (mais recentes)</p>
    <div class="cards">${stats.map((s) => `<div class="card"><div class="n">${s.n}</div><div class="l">${s.l}</div></div>`).join("")}</div>
    ${list.length ? `<table><tr><th>Nome</th><th>WhatsApp</th><th>Temp</th><th>Status</th><th>Orçamento</th><th>Criado</th></tr>${rows}</table>` : `<div class="empty">Nenhum lead ainda. Quando um lead preencher o formulário, ele aparece aqui.</div>`}
  `);
});
