import { admin } from "./db.ts";

/**
 * Carrega a config editável (tabela aa_config) como mapa key->value.
 * Sem cache: muda raramente e o custo é baixo (1 query por mensagem). Falha-segura: retorna {} em erro.
 */
export async function loadConfig(): Promise<Record<string, string>> {
  try {
    const { data } = await admin().from("aa_config").select("key,value");
    const out: Record<string, string> = {};
    for (const r of (data ?? [])) {
      if (r.value != null && String(r.value).trim() !== "") out[r.key] = String(r.value);
    }
    return out;
  } catch {
    return {};
  }
}
