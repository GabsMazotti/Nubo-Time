import type { Temperature } from "./pipeline.ts";

/** Piso de qualificaÃ§Ã£o: R$10.000/mÃªs (estrutura + trÃ¡fego). */
export const QUALIFY_FLOOR = 10000;

/** Piso para entrar na abordagem/remarketing do Gabriel: R$5.000/mÃªs (mÃ­nimo do formulÃ¡rio). */
export const OUTREACH_FLOOR = 5000;

export interface BudgetRange {
  min: number | null;
  max: number | null;
}

/**
 * Interpreta a faixa de orÃ§amento a partir do texto do formulÃ¡rio.
 * Exemplos:
 *  "De R$5.000,00 a R$10.000 por mÃªs" -> { min:5000, max:10000 }
 *  "Acima de R$30.000"                -> { min:30000, max:null }
 *  "R$20.000/mÃªs"                     -> { min:20000, max:20000 }
 *  "nÃ£o tenho capital"                -> { min:0, max:0 }
 */
export function parseBudget(text?: string | null): BudgetRange {
  if (!text) return { min: null, max: null };
  const t = text.toLowerCase();

  if (/(nÃ£o tenho|nao tenho|sem capital|sem or[Ã§c]amento|zero)/.test(t)) {
    return { min: 0, max: 0 };
  }

  // Captura valores monetÃ¡rios (com pontos de milhar e centavos opcionais)
  const nums: number[] = [];
  const re = /(\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{2})?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    const n = parseInt(m[1].replace(/\./g, ""), 10);
    if (!Number.isNaN(n) && n >= 100) nums.push(n); // ignora nÃºmeros pequenos (ex.: "7 dias")
  }
  if (nums.length === 0) return { min: null, max: null };

  if (/(acima|mais de|a partir|\+)/.test(t) && nums.length === 1) {
    return { min: nums[0], max: null };
  }
  if (nums.length >= 2) {
    const sorted = [...nums].sort((a, b) => a - b);
    return { min: sorted[0], max: sorted[sorted.length - 1] };
  }
  return { min: nums[0], max: nums[0] };
}

/** Temperatura inicial pelo orÃ§amento informado no formulÃ¡rio. */
export function initialTemperature(range: BudgetRange): Temperature {
  const v = range.min ?? 0;
  if (v >= QUALIFY_FLOOR) return "quente";
  if (v >= 5000) return "morno";
  return "frio";
}

/**
 * Pela regra do R$10k:
 *  - >= 10k  -> qualifica direto (sem precisar confirmar)
 *  - 5kâ€“10k  -> NÃƒO qualifica automaticamente (precisa confirmar na conversa)
 *  - < 5k    -> nÃ£o qualifica
 * Retorna 'qualifica' | 'confirmar' | 'nao'.
 */
export function budgetVerdict(range: BudgetRange): "qualifica" | "confirmar" | "nao" {
  const min = range.min;
  if (min == null) return "confirmar";
  if (min >= QUALIFY_FLOOR) return "qualifica";
  if (min >= 5000) return "confirmar";
  return "nao";
}
