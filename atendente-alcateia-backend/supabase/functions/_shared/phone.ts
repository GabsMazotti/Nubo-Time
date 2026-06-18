// Normalizador de telefone robusto.
// Aceita string, número, objeto, array e campos aninhados — e SEMPRE extrai o número real,
// evitando o bug em que o telefone chega/é gravado como "[object Object]".
//
// Saída esperada para o exemplo do briefing: "55 83988808063" -> "5583988808063".

export interface NormalizedPhone {
  ok: boolean;
  /** Somente dígitos, com DDI. Ex.: "5583988808063". null se inválido. */
  phone: string | null;
  /** Valor original recebido (para auditoria). */
  raw: unknown;
  reason?: string;
}

const CANDIDATE_KEYS = [
  "number", "phone", "whatsapp", "value", "raw", "tel", "telefone",
  "msisdn", "e164", "phone_number", "phoneNumber", "celular", "contato",
];

/** Extrai a primeira sequência de dígitos plausível de qualquer formato de entrada. */
function extractDigits(input: unknown, depth = 0): string {
  if (input == null || depth > 6) return "";
  if (typeof input === "number" && Number.isFinite(input)) {
    return String(Math.trunc(input)).replace(/\D/g, "");
  }
  if (typeof input === "string") {
    // "[object Object]" e textos sem dígito viram "".
    return input.replace(/\D/g, "");
  }
  if (Array.isArray(input)) {
    for (const item of input) {
      const r = extractDigits(item, depth + 1);
      if (r) return r;
    }
    return "";
  }
  if (typeof input === "object") {
    const obj = input as Record<string, unknown>;
    // 1) chaves conhecidas, na ordem de prioridade
    for (const k of CANDIDATE_KEYS) {
      if (k in obj) {
        const r = extractDigits(obj[k], depth + 1);
        if (r) return r;
      }
    }
    // 2) fallback: qualquer valor que contenha dígitos
    for (const v of Object.values(obj)) {
      const r = extractDigits(v, depth + 1);
      if (r) return r;
    }
    return "";
  }
  return "";
}

export function normalizePhone(input: unknown): NormalizedPhone {
  let d = extractDigits(input);
  if (!d) {
    return { ok: false, phone: null, raw: input, reason: "sem_numero_extraivel" };
  }

  // Remove zeros à esquerda e prefixo internacional "00"
  d = d.replace(/^0+/, "");
  if (d.startsWith("00")) d = d.slice(2);

  // Número brasileiro local (10 = fixo/DDD+8, 11 = celular/DDD+9) -> prepend DDI 55
  if (!d.startsWith("55") && (d.length === 10 || d.length === 11)) {
    d = "55" + d;
  }

  // Brasil: 55 + DDD(2) + 8 ou 9 dígitos = 12 ou 13
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) {
    return { ok: true, phone: d, raw: input };
  }

  // Outros países (best effort): 11 a 15 dígitos
  if (d.length >= 11 && d.length <= 15) {
    return { ok: true, phone: d, raw: input };
  }

  return { ok: false, phone: null, raw: input, reason: `tamanho_invalido_${d.length}` };
}
