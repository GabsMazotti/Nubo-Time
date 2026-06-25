// Dossiê pré-call: retrato DESCRITIVO do lead (sem sugestões de abordagem) pro Gabriel ler 1h antes
// da call. Gera via Claude a partir do formulário + conversa, e formata pro WhatsApp.
import { formatDiaHora } from "./util.ts";

export interface DossieFields {
  perfil: string;       // mercado/nicho, momento, orçamento
  experiencia: string;  // experiência do lead no mercado (tempo, o que já fez)
  o_que_quer: string;   // objetivo do lead
  sinais: string;       // sinais de qualificação
  duvidas: string;      // dúvidas/objeções que levantou
  resumo: string;       // resumo factual da conversa
}

const TOOL = {
  name: "montar_dossie",
  description: "Monta o dossiê DESCRITIVO do lead pro Gabriel ler antes da call. SÓ retrato do lead — NUNCA sugestões de abordagem, ângulo ou o que falar.",
  input_schema: {
    type: "object",
    properties: {
      perfil: { type: "string", description: "Mercado/nicho, momento (começando ou já opera) e orçamento informado. 1–2 linhas factuais." },
      experiencia: { type: "string", description: "Experiência do lead no mercado: há quanto tempo atua, o que já rodou/fez, nível. Se não houver dado, escreva 'não informado'." },
      o_que_quer: { type: "string", description: "O objetivo do lead, com as palavras dele. 1–2 linhas." },
      sinais: { type: "string", description: "Sinais de qualificação (orçamento, urgência, operação ativa) separados por ' · '." },
      duvidas: { type: "string", description: "Dúvidas/objeções que o lead levantou na conversa, separadas por ' · '. Se nenhuma, escreva 'nenhuma'." },
      resumo: { type: "string", description: "Resumo factual da conversa em 2–3 frases curtas." },
    },
    required: ["perfil", "experiencia", "o_que_quer", "sinais", "duvidas", "resumo"],
  },
} as const;

/** Gera os campos do dossiê via Claude (retrato factual, sem coaching). */
export async function generateDossie(ctx: {
  lead: Record<string, unknown>;
  conversation: { role: "user" | "assistant"; content: string }[];
  funnelLabel: string;
}): Promise<DossieFields> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY ausente");
  const model = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-4-6";

  const system = `Você é um analista de pré-venda. A partir dos DADOS DO LEAD e da conversa, monte um DOSSIÊ
DESCRITIVO pro Gabriel ler antes da call (funil: ${ctx.funnelLabel}).
REGRAS: é só um RETRATO do lead — NUNCA dê sugestões de abordagem, ângulo, script ou o que falar na call.
Seja factual, curto e baseado SÓ no que o lead disse/preencheu. Onde faltar dado, escreva "não informado".
Português do Brasil. Chame a ferramenta "montar_dossie".

DADOS DO LEAD:
${JSON.stringify(ctx.lead, null, 2)}`;

  // A conversa entra como TEXTO num único turno do usuário (é contexto p/ análise, não diálogo a
  // continuar) — evita o erro 400 "conversa deve terminar em mensagem do usuário".
  const convText = ctx.conversation.length > 0
    ? ctx.conversation.map((m) => `${m.role === "user" ? "Lead" : "Atendente"}: ${m.content}`).join("\n")
    : "(sem conversa registrada — use só os dados do formulário)";
  const messages = [{
    role: "user" as const,
    content: `CONVERSA ATÉ AGORA:\n${convText}\n\nMonte o dossiê deste lead chamando a ferramenta "montar_dossie".`,
  }];

  const body = JSON.stringify({
    model, max_tokens: 800, system, tools: [TOOL],
    tool_choice: { type: "tool", name: "montar_dossie" }, messages,
  });

  const RETRYABLE = new Set([429, 500, 502, 503, 504, 529]);
  let lastErr = "Anthropic indisponível";
  for (let i = 0; i < 3; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 800 * i));
    let res: Response;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body,
      });
    } catch (e) { lastErr = `fetch_error: ${(e as Error).message}`; continue; }
    if (res.ok) {
      const d = await res.json();
      const t = (d.content ?? []).find((b: { type: string }) => b.type === "tool_use");
      if (!t) throw new Error("Resposta sem tool_use");
      return t.input as DossieFields;
    }
    lastErr = `Anthropic ${res.status}: ${await res.text()}`;
    if (!RETRYABLE.has(res.status)) break;
  }
  throw new Error(lastErr);
}

const TEMP: Record<string, string> = { quente: "🔥 Quente", morno: "🌤️ Morno", frio: "❄️ Frio" };

/** Formata o dossiê como mensagem de WhatsApp pro Gabriel. */
export function formatDossie(
  lead: Record<string, any>,
  appt: Record<string, any>,
  funnelLabel: string,
  d: DossieFields,
): string {
  const quando = appt?.scheduled_at ? formatDiaHora(appt.scheduled_at) : "horário a confirmar";
  const temp = TEMP[String(lead.temperature ?? "")] ?? "";
  const link = appt?.meeting_url ? `\n🔗 ${appt.meeting_url}` : "";
  return `🎯 DOSSIÊ — ${lead.name ?? "lead"}${temp ? "  ·  " + temp : ""}
📅 ${quando}  ·  ${funnelLabel}  ·  📱 ${lead.phone ?? "—"}${link}

📌 PERFIL
${d.perfil}

🧭 EXPERIÊNCIA NO MERCADO
${d.experiencia}

🎯 O QUE ELE QUER
${d.o_que_quer}

✅ SINAIS DE QUALIFICAÇÃO
${d.sinais}

❓ DÚVIDAS QUE ELE LEVANTOU
${d.duvidas}

📝 RESUMO DA CONVERSA
${d.resumo}`;
}
