import { admin } from "./db.ts";
import { OUTREACH_FLOOR, QUALIFY_FLOOR } from "./qualification.ts";
import {
  buildPersonas,
  buildTemplates,
  CALENDLY_URL,
  FAQ_KEYS,
  FAQ_MENTORIA_KEYS,
  MENTORIA_CALENDLY_URL,
  PERSONA_DEFAULTS,
  PERSONA_MENTORIA_DEFAULTS,
} from "./persona.ts";

export type Funnel = "alcateia" | "mentoria";

/** Sanitiza o funil: qualquer valor diferente de 'mentoria' vira 'alcateia' (default SEGURO). */
export function normFunnel(f?: string | null): Funnel {
  return f === "mentoria" ? "mentoria" : "alcateia";
}

/**
 * Carrega a config editável (aa_config) DO FUNIL como mapa key->value.
 * Sem cache; falha-segura: retorna {} em erro. Default 'alcateia'.
 */
export async function loadConfig(funnel: string = "alcateia"): Promise<Record<string, string>> {
  const f = normFunnel(funnel);
  try {
    const { data } = await admin().from("aa_config").select("key,value").eq("funnel", f);
    const out: Record<string, string> = {};
    for (const r of (data ?? [])) {
      if (r.value != null && String(r.value).trim() !== "") out[r.key] = String(r.value);
    }
    return out;
  } catch {
    return {};
  }
}

/** Defaults + FAQ + Calendly de cada funil. FONTE ÚNICA — é aqui que os dois NUNCA se misturam. */
export function funnelDefaults(funnel?: string | null) {
  const f = normFunnel(funnel);
  if (f === "mentoria") {
    return {
      funnel: f,
      defaults: PERSONA_MENTORIA_DEFAULTS,
      faqKeys: FAQ_MENTORIA_KEYS,
      calendlyUrl: MENTORIA_CALENDLY_URL,
      reschedUrl: Deno.env.get("MENTORIA_CALENDLY_RESCHEDULE_URL") ?? MENTORIA_CALENDLY_URL,
      // Mentoria: qualifica a partir de R$5k (ticket menor que a agência).
      qualifyFloor: 5000,
      outreachFloor: 5000,
      // Lembretes de confirmação da mentoria: 1h, 30min e 10min antes (com o link).
      reminders: [
        { type: "meeting_confirmation_1h", offsetMin: 60 },
        { type: "meeting_confirmation_30min", offsetMin: 30 },
        { type: "meeting_confirmation_10min", offsetMin: 10 },
      ] as { type: string; offsetMin: number }[],
    };
  }
  return {
    funnel: f,
    defaults: PERSONA_DEFAULTS,
    faqKeys: FAQ_KEYS,
    calendlyUrl: CALENDLY_URL,
    reschedUrl: Deno.env.get("CALENDLY_RESCHEDULE_URL") ?? CALENDLY_URL,
    // Alcateia: regra do R$10k (qualifica) / R$5k (entra na abordagem).
    qualifyFloor: QUALIFY_FLOOR,
    outreachFloor: OUTREACH_FLOOR,
    // Lembretes de confirmação da Alcateia: 3h, 1h e 10min antes (com o link).
    reminders: [
      { type: "meeting_confirmation_3h", offsetMin: 180 },
      { type: "meeting_confirmation_1h", offsetMin: 60 },
      { type: "meeting_confirmation_10min", offsetMin: 10 },
    ] as { type: string; offsetMin: number }[],
  };
}

/**
 * Contexto COMPLETO do funil: config + personas + templates + links.
 * Use SEMPRE isto no hot-path (passando lead.funnel) — garante que persona, mensagens e Calendly
 * batem com o funil do lead e jamais cruzam.
 */
export async function funnelContext(funnel?: string | null) {
  const fd = funnelDefaults(funnel);
  const cfg = await loadConfig(fd.funnel);
  return {
    ...fd,
    cfg,
    personas: buildPersonas(cfg, fd.defaults, fd.faqKeys),
    templates: buildTemplates(cfg, fd.defaults),
  };
}
