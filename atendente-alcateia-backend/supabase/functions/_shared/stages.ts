// Funil de etapas (stages) — motor configurável + sync de remarketing.
//
// Como funciona (gatilho HÍBRIDO):
//   1) REGRAS (palavras/frases configuráveis no painel) têm prioridade. Se uma palavra
//      casar com a conversa, a etapa é marcada e (em status "normais") atualiza o CRM.
//   2) Se nenhuma regra casar, a IA reforça: o status decidido pelo cérebro vira etapa
//      pelo mapa STATUS_TO_STAGE.
//   3) Guarda anti-regressão: a etapa não "volta" no funil por engano, exceto para as
//      etapas de fallback (em_remarketing / qualificado_sem_agendar).
//
// Tudo é falha-segura: se as tabelas ainda não existirem, usa os defaults embutidos.

import type { admin } from "./db.ts";
import type { LeadStatus } from "./pipeline.ts";

export type StageReason = "rule" | "ai" | "system" | "manual" | "keep";

export interface Stage {
  key: string;
  label: string;
  sort_order: number;
  status: string;   // aa_lead_status que esta etapa aplica
  color?: string;
  is_active?: boolean;
}

export interface StageRule {
  id?: number;
  stage_key: string;
  direction: "inbound" | "outbound" | "any";
  match_type: "contains" | "regex";
  pattern: string;
  priority: number;
  is_active?: boolean;
}

type DB = ReturnType<typeof admin>;

// ──────────────────────────────────────────────────────────────────────────────
// Defaults (espelham o seed da migration 0009; servem de fallback se a tabela
// estiver vazia/indisponível).
// ──────────────────────────────────────────────────────────────────────────────
export const STAGE_DEFAULTS: Stage[] = [
  { key: "primeiro_contato",        label: "1️⃣ Primeiro contato",        sort_order: 10, status: "contato_realizado",      color: "#64748b" },
  { key: "em_conversa",             label: "2️⃣ Em conversa",             sort_order: 20, status: "em_atendimento",         color: "#3b82f6" },
  { key: "qualificado",             label: "3️⃣ Qualificado",             sort_order: 30, status: "qualificado",            color: "#22c55e" },
  { key: "agenda_enviada",          label: "4️⃣ Agenda enviada",          sort_order: 40, status: "aguardando_agendamento", color: "#14b8a6" },
  { key: "qualificado_sem_agendar", label: "5️⃣ Qualificado sem agendar", sort_order: 50, status: "aguardando_agendamento", color: "#f59e0b" },
  { key: "em_remarketing",          label: "6️⃣ Em remarketing",          sort_order: 60, status: "nutricao",               color: "#f97316" },
  { key: "reuniao_marcada",         label: "7️⃣ Reunião marcada",         sort_order: 70, status: "call_agendada",          color: "#16a34a" },
  { key: "reuniao_confirmada",      label: "8️⃣ Reunião confirmada",      sort_order: 80, status: "call_confirmada",        color: "#15803d" },
];

/** Status do cérebro -> etapa (reforço da IA quando nenhuma palavra casa). */
export const STATUS_TO_STAGE: Partial<Record<LeadStatus, string>> = {
  novo_lead: "primeiro_contato",
  contato_realizado: "primeiro_contato",
  sem_resposta: "primeiro_contato",
  em_atendimento: "em_conversa",
  precisa_humano: "em_conversa",
  qualificado: "qualificado",
  aguardando_agendamento: "agenda_enviada",
  morno: "em_remarketing",
  nutricao: "em_remarketing",
  reuniao_cancelada: "qualificado_sem_agendar",
  call_agendada: "reuniao_marcada",
  reuniao_remarcada: "reuniao_marcada",
  remarcar_reuniao: "reuniao_marcada",
  nao_confirmado: "reuniao_marcada",
  risco_no_show: "reuniao_marcada",
  call_confirmada: "reuniao_confirmada",
  // nao_qualificado / perdido / opt_out -> sem etapa de funil (mantém a etapa atual)
};

/** Etapas de "fallback" para as quais é permitido regredir (lead que travou/voltou). */
const FALLBACK_STAGES = new Set(["em_remarketing", "qualificado_sem_agendar"]);

/** Etapas que exigem reunião real: só se entra nelas com agendamento ativo (não por palavra solta). */
const APPOINTMENT_STAGES = new Set(["reuniao_marcada", "reuniao_confirmada"]);

/**
 * Status em que a etapa PODE sobrescrever o status do CRM (faixa normal do funil:
 * do primeiro contato até a agenda). Status de reunião/confirmação/handoff ficam de
 * fora — quem manda neles é a lógica viva do atendimento, não as palavras-gatilho.
 */
const OVERRIDABLE_STATUSES = new Set<string>([
  "novo_lead", "contato_realizado", "em_atendimento",
  "qualificado", "aguardando_agendamento", "morno", "nutricao", "sem_resposta",
]);

// ──────────────────────────────────────────────────────────────────────────────
// Carregamento (falha-seguro)
// ──────────────────────────────────────────────────────────────────────────────
export async function loadStages(db: DB): Promise<Stage[]> {
  try {
    const { data } = await db.from("aa_stages").select("*").eq("is_active", true).order("sort_order", { ascending: true });
    if (data && data.length) return data as Stage[];
  } catch { /* tabela ausente -> default */ }
  return STAGE_DEFAULTS;
}

export async function loadStageRules(db: DB): Promise<StageRule[]> {
  try {
    const { data } = await db.from("aa_stage_rules").select("*").eq("is_active", true).order("priority", { ascending: false });
    if (data) return data as StageRule[];
  } catch { /* tabela ausente -> sem regras (só IA) */ }
  return [];
}

// ──────────────────────────────────────────────────────────────────────────────
// Avaliação
// ──────────────────────────────────────────────────────────────────────────────
function stageByKey(stages: Stage[], key?: string | null): Stage | undefined {
  if (!key) return undefined;
  return stages.find((s) => s.key === key);
}

function ruleMatches(rule: StageRule, text: string): boolean {
  if (!text) return false;
  const hay = text.toLowerCase();
  if (rule.match_type === "regex") {
    try { return new RegExp(rule.pattern, "i").test(text); } catch { return false; }
  }
  return hay.includes(rule.pattern.toLowerCase());
}

export interface StageEval {
  stage: string | null;       // etapa final
  changed: boolean;           // mudou em relação à etapa atual do lead
  reason: StageReason;        // como foi decidido
  ruleId?: number;
  status?: string;            // status do CRM a aplicar SE reason==='rule' e estiver na faixa sobrescrevível
}

/**
 * Decide a etapa do lead a partir das últimas mensagens (regras) e do status da IA (reforço).
 * Não escreve no banco — só calcula. O caller persiste.
 */
export function evaluateStage(opts: {
  stages: Stage[];
  rules: StageRule[];
  currentStage?: string | null;
  inboundText?: string | null;   // mensagem recém-recebida do lead
  outboundText?: string | null;  // resposta que o atendente vai enviar
  aiStatus?: string | null;      // status decidido pelo cérebro
  currentStatus?: string | null; // status atual aplicado (p/ saber se é sobrescrevível)
  hasActiveAppt?: boolean;        // lead tem reunião ativa? (libera etapas de reunião)
}): StageEval {
  const { stages, rules, currentStage } = opts;
  const inText = opts.inboundText ?? "";
  const outText = opts.outboundText ?? "";
  const curStage = stageByKey(stages, currentStage);
  const curOrder = curStage?.sort_order ?? -1;

  // Aceita a etapa candidata aplicando as guardas (anti-regressão + reunião real).
  const accept = (key: string | undefined, reason: StageReason, ruleId?: number): StageEval | null => {
    const cand = stageByKey(stages, key);
    if (!cand) return null;
    // Etapas de reunião só com agendamento real (evita "confirmada" por palavra solta sem call).
    if (APPOINTMENT_STAGES.has(cand.key) && !opts.hasActiveAppt) return null;
    const advancing = cand.sort_order >= curOrder;
    const allowedFallback = FALLBACK_STAGES.has(cand.key);
    if (!advancing && !allowedFallback) return null; // não regride por engano
    const changed = cand.key !== curStage?.key;
    // Só sugere status do CRM quando veio de REGRA e tanto o status atual quanto o alvo
    // estão na faixa normal do funil (status de reunião ficam a cargo da lógica viva).
    const overridable = reason === "rule" &&
      OVERRIDABLE_STATUSES.has(String(opts.currentStatus ?? opts.aiStatus ?? "")) &&
      OVERRIDABLE_STATUSES.has(cand.status);
    return { stage: cand.key, changed, reason, ruleId, status: overridable ? cand.status : undefined };
  };

  // 1) Regras (palavras/frases) — maior prioridade primeiro.
  for (const r of [...rules].sort((a, b) => b.priority - a.priority)) {
    const text = r.direction === "inbound" ? inText : r.direction === "outbound" ? outText : `${inText}\n${outText}`;
    if (ruleMatches(r, text)) {
      const res = accept(r.stage_key, "rule", r.id);
      if (res) return res;
    }
  }

  // 2) Reforço da IA — status -> etapa.
  const aiKey = opts.aiStatus ? STATUS_TO_STAGE[opts.aiStatus as LeadStatus] : undefined;
  if (aiKey) {
    const res = accept(aiKey, "ai");
    if (res) return res;
  }

  // 3) Mantém a etapa atual.
  return { stage: currentStage ?? null, changed: false, reason: "keep" };
}

// ──────────────────────────────────────────────────────────────────────────────
// Remarketing: mantém a fila e a "coluna remarketing" do lead em sincronia.
// ──────────────────────────────────────────────────────────────────────────────
export async function syncRemarketing(
  db: DB,
  lead: { id: string; qualified_at?: string | null },
  opts: { stageKey: string | null; qualified: boolean; hasActiveAppt: boolean; reason?: string },
): Promise<void> {
  const stageKey = opts.stageKey;
  const inRemarketing = stageKey === "em_remarketing";
  // Qualificado e sem reunião ativa nas etapas pós-qualificação -> entra/permanece na fila.
  const qualifiedNoMeeting = opts.qualified && !opts.hasActiveAppt &&
    ["qualificado", "agenda_enviada", "qualificado_sem_agendar", "em_remarketing"].includes(String(stageKey));

  try {
    await db.from("aa_leads").update({
      remarketing: inRemarketing,
      qualified_no_meeting: qualifiedNoMeeting,
    }).eq("id", lead.id);

    if (opts.hasActiveAppt) {
      // Voltou a ter reunião -> marca como recuperado (mantém histórico, não apaga).
      await db.from("aa_remarketing").update({ status: "recuperado", recovered_at: new Date().toISOString() })
        .eq("lead_id", lead.id).neq("status", "recuperado");
      return;
    }

    if (qualifiedNoMeeting) {
      await db.from("aa_remarketing").upsert({
        lead_id: lead.id,
        qualified_at: lead.qualified_at ?? new Date().toISOString(),
        reason: opts.reason ?? (inRemarketing ? "em_remarketing" : "qualificado_sem_agendar"),
        stage: stageKey,
        status: inRemarketing ? "em_andamento" : "pendente",
      }, { onConflict: "lead_id" });
    }
  } catch { /* falha-segura */ }
}
