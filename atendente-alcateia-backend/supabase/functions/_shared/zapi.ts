// Integração Z-API (WhatsApp). Envia mensagens de texto.
// Docs: https://developer.z-api.io/

export interface SendResult {
  ok: boolean;
  id?: string;
  reason?: string;
}

function creds() {
  return {
    base: (Deno.env.get("ZAPI_BASE_URL") ?? "https://api.z-api.io").replace(/\/+$/, ""),
    instance: Deno.env.get("ZAPI_INSTANCE_ID") ?? "",
    token: Deno.env.get("ZAPI_TOKEN") ?? "",
    clientToken: Deno.env.get("ZAPI_CLIENT_TOKEN") ?? "",
  };
}

/** Envia uma mensagem de texto pelo WhatsApp via Z-API. */
export async function sendText(phone: string, message: string): Promise<SendResult> {
  const c = creds();
  if (!c.instance || !c.token) {
    // Modo dry-run (sem credenciais ainda): não envia, mas não quebra o fluxo.
    console.warn("[zapi] credenciais ausentes — mensagem NÃO enviada (dry-run):", phone, message.slice(0, 60));
    return { ok: false, reason: "sem_credenciais_zapi" };
  }
  const url = `${c.base}/instances/${c.instance}/token/${c.token}/send-text`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(c.clientToken ? { "Client-Token": c.clientToken } : {}),
      },
      body: JSON.stringify({ phone, message }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, reason: `zapi_${res.status}: ${JSON.stringify(data)}` };
    return { ok: true, id: data.messageId ?? data.id ?? data.zaapId };
  } catch (e) {
    return { ok: false, reason: `zapi_fetch_error: ${(e as Error).message}` };
  }
}

/** Extrai telefone + texto + id de um payload de mensagem recebida da Z-API (on-message-received). */
export function parseInbound(payload: Record<string, unknown>): {
  phone?: string;
  text?: string;
  messageId?: string;
  isAudio: boolean;
  isMedia: boolean;
  fromMe: boolean;
} {
  const phone = (payload.phone ?? payload.from ?? "") as string;
  const messageId = (payload.messageId ?? payload.id ?? payload.zaapId) as string | undefined;
  const fromMe = Boolean(payload.fromMe);
  const text =
    ((payload.text as { message?: string } | undefined)?.message) ??
    (payload.body as string | undefined) ??
    (payload.message as string | undefined);
  const isAudio = Boolean(payload.audio);
  const isMedia = Boolean(payload.image || payload.document || payload.video || payload.audio || payload.sticker);
  return { phone: phone || undefined, text: text || undefined, messageId, isAudio, isMedia, fromMe };
}
