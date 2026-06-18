const TZ = Deno.env.get("TIMEZONE") ?? "America/Sao_Paulo";

/** "14:00" no fuso configurado. */
export function formatHorario(iso: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit", minute: "2-digit", timeZone: TZ,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** "17/06 14:00" no fuso configurado. */
export function formatDataHora(iso: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: TZ,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function resumoLead(lead: Record<string, unknown>): string {
  const partes = [lead.role, lead.market, lead.works_with].filter(Boolean);
  return partes.join(" · ") || "—";
}
