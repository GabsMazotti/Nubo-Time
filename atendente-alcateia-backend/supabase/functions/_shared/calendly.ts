// Integração Calendly (webhook de eventos de agendamento).
// Docs: https://developer.calendly.com/api-docs (webhook v2)
import { normalizePhone } from "./phone.ts";

export const CALENDLY_URL =
  Deno.env.get("CALENDLY_EVENT_URL") ?? "https://calendly.com/alcateiamedia00/alcateia-media";

export interface CalendlyEvent {
  kind: "created" | "canceled" | "rescheduled" | "unknown";
  eventId?: string;       // URI/ID do invitee (idempotência)
  scheduledAt?: string;   // ISO start_time
  name?: string;
  email?: string;
  phone?: string;         // melhor esforço (questions_and_answers / text_reminder_number)
  meetingUrl?: string;
}

/** Tenta achar um telefone nas respostas do invitee. */
function findPhone(payload: Record<string, unknown>): string | undefined {
  const direct = payload.text_reminder_number as string | undefined;
  if (direct) {
    const n = normalizePhone(direct);
    if (n.ok) return n.phone!;
  }
  const qa = (payload.questions_and_answers as { question?: string; answer?: string }[] | undefined) ?? [];
  for (const item of qa) {
    const q = (item.question ?? "").toLowerCase();
    if (/whats|telefone|phone|celular|contato/.test(q)) {
      const n = normalizePhone(item.answer);
      if (n.ok) return n.phone!;
    }
  }
  // fallback: qualquer resposta que normalize para telefone válido
  for (const item of qa) {
    const n = normalizePhone(item.answer);
    if (n.ok) return n.phone!;
  }
  return undefined;
}

/**
 * Procura, em qualquer lugar do payload (string/objeto/array), o UUID de um
 * scheduled_event do Calendly — usado quando o lead agenda DENTRO do formulário Respondi.
 */
export function extractCalendlyEventUuid(payload: unknown, depth = 0): string | undefined {
  if (payload == null || depth > 8) return undefined;
  if (typeof payload === "string") {
    const m = payload.match(/scheduled_events\/([a-f0-9-]{8,})/i);
    if (m) return m[1];
    return undefined;
  }
  if (Array.isArray(payload)) {
    for (const item of payload) { const r = extractCalendlyEventUuid(item, depth + 1); if (r) return r; }
    return undefined;
  }
  if (typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    // formato embed.calendly do Respondi: { event: "<uuid>", invite: "...", original: {...} }
    if (typeof obj.event === "string" && /^[a-f0-9-]{8,}$/i.test(obj.event)) return obj.event;
    for (const v of Object.values(obj)) { const r = extractCalendlyEventUuid(v, depth + 1); if (r) return r; }
    return undefined;
  }
  return undefined;
}

/** Busca o horário (start_time ISO) de um scheduled_event via Calendly API. Requer CALENDLY_API_TOKEN. */
export async function fetchCalendlyEventStart(
  uuid: string,
): Promise<{ startTime?: string; meetingUrl?: string } | null> {
  const token = Deno.env.get("CALENDLY_API_TOKEN");
  if (!token) return null;
  try {
    const res = await fetch(`https://api.calendly.com/scheduled_events/${uuid}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const r = data.resource ?? {};
    return { startTime: r.start_time, meetingUrl: r.location?.join_url };
  } catch {
    return null;
  }
}

/** Pega os links de remarcação/cancelamento do invitee de um evento. Requer CALENDLY_API_TOKEN. */
export async function getInviteeLinks(
  eventUuid: string,
): Promise<{ rescheduleUrl?: string; cancelUrl?: string } | null> {
  const token = Deno.env.get("CALENDLY_API_TOKEN");
  if (!token) return null;
  try {
    const res = await fetch(`https://api.calendly.com/scheduled_events/${eventUuid}/invitees`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const inv = data.collection?.[0] ?? {};
    return { rescheduleUrl: inv.reschedule_url, cancelUrl: inv.cancel_url };
  } catch {
    return null;
  }
}

/** Cancela um scheduled_event via API. Requer CALENDLY_API_TOKEN (escopo scheduled_events:write). */
export async function cancelCalendlyEvent(
  eventUuid: string,
  reason = "Cancelado a pedido do lead",
): Promise<boolean> {
  const token = Deno.env.get("CALENDLY_API_TOKEN");
  if (!token) return false;
  try {
    const res = await fetch(`https://api.calendly.com/scheduled_events/${eventUuid}/cancellation`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Detecta o FUNIL pelo conteúdo do webhook: o evento da mentoria (slug/nome "mentoria-affiliaplay")
 * contém "mentoria"; o da Alcateia ("alcateia-media") não. Default seguro: 'alcateia'.
 */
export function detectFunnel(body: unknown): "alcateia" | "mentoria" {
  try {
    return JSON.stringify(body).toLowerCase().includes("mentoria") ? "mentoria" : "alcateia";
  } catch {
    return "alcateia";
  }
}

/** Interpreta o corpo do webhook do Calendly. */
export function parseCalendlyWebhook(body: Record<string, unknown>): CalendlyEvent {
  const eventType = String(body.event ?? "");
  const payload = (body.payload ?? {}) as Record<string, unknown>;
  const scheduled = (payload.scheduled_event ?? {}) as Record<string, unknown>;
  const location = (scheduled.location ?? {}) as Record<string, unknown>;

  let kind: CalendlyEvent["kind"] = "unknown";
  if (eventType.includes("invitee.created")) kind = "created";
  else if (eventType.includes("invitee.canceled")) kind = "canceled";

  // rescheduled vem como canceled (old) + created (new) com flag rescheduled=true
  if (payload.rescheduled === true && kind === "created") kind = "rescheduled";

  return {
    kind,
    // UUID do scheduled_event (consistente com o respondi-webhook)
    eventId: extractCalendlyEventUuid(body) ?? (payload.uri as string | undefined),
    scheduledAt: scheduled.start_time as string | undefined,
    name: payload.name as string | undefined,
    email: payload.email as string | undefined,
    phone: findPhone(payload),
    meetingUrl: (location.join_url ?? location.location) as string | undefined,
  };
}
