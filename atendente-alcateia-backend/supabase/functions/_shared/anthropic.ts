import { PERSONA_SYSTEM_PROMPT } from "./persona.ts";
import { STATUS } from "./pipeline.ts";

export interface BrainDecision {
  reply: string;
  status: string;
  temperature: "quente" | "morno" | "frio";
  qualified: boolean;
  needs_human: boolean;
  send_calendly: boolean;
  notify_gabriel: boolean;
  gabriel_message?: string;
  history_note?: string;
}

export interface BrainContext {
  lead: Record<string, unknown>;
  /** Conversa: [{role:'user'|'assistant', content}]. user = lead, assistant = agente. */
  conversation: { role: "user" | "assistant"; content: string }[];
  /** Instrução extra do sistema (ex.: "Esta é a 1ª mensagem; nenhuma resposta do lead ainda."). */
  situation?: string;
  /** Persona/system prompt a usar (CONFIRMACAO x REMARKETING). Padrão: PERSONA_SYSTEM_PROMPT. */
  personaPrompt?: string;
}

const TOOL = {
  name: "responder_lead",
  description: "Registra a próxima mensagem ao lead e as decisões do atendimento.",
  input_schema: {
    type: "object",
    properties: {
      reply: { type: "string", description: "Mensagem a enviar ao lead no WhatsApp (curta, humana, 1 pergunta por vez)." },
      status: { type: "string", enum: STATUS, description: "Novo status do pipeline." },
      temperature: { type: "string", enum: ["quente", "morno", "frio"] },
      qualified: { type: "boolean" },
      needs_human: { type: "boolean", description: "true se precisa de atendimento humano (handoff)." },
      send_calendly: { type: "boolean", description: "true para anexar o link do Calendly à mensagem." },
      notify_gabriel: { type: "boolean", description: "Sinal INTERNO (não aparece pro lead): true quando o caso precisa de acompanhamento humano/operacional." },
      gabriel_message: { type: "string", description: "Resumo interno do caso para acompanhamento, se notify_gabriel." },
      history_note: { type: "string", description: "Nota curta para o histórico do lead." },
    },
    required: ["reply", "status", "temperature", "qualified", "needs_human", "send_calendly", "notify_gabriel"],
  },
} as const;

/** Chama o Claude com a persona e devolve a decisão estruturada. */
export async function callBrain(ctx: BrainContext): Promise<BrainDecision> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY ausente");
  const model = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-4-6";

  const system = `${ctx.personaPrompt ?? PERSONA_SYSTEM_PROMPT}

CONTEXTO DO LEAD (dados do formulário e estado atual):
${JSON.stringify(ctx.lead, null, 2)}
${ctx.situation ? `\nSITUAÇÃO: ${ctx.situation}` : ""}`;

  // Garante ao menos uma mensagem do "user" (a API exige).
  const messages = ctx.conversation.length > 0
    ? ctx.conversation
    : [{ role: "user" as const, content: "(novo lead recebido pelo formulário; ainda não respondeu)" }];

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system,
      tools: [TOOL],
      tool_choice: { type: "tool", name: "responder_lead" },
      messages,
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Anthropic ${res.status}: ${txt}`);
  }

  const data = await res.json();
  const toolUse = (data.content ?? []).find((b: { type: string }) => b.type === "tool_use");
  if (!toolUse) throw new Error("Resposta sem tool_use");
  return toolUse.input as BrainDecision;
}
