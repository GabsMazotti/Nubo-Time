// Status do pipeline (mesmos valores do enum aa_lead_status no banco).
export const STATUS = [
  "novo_lead", "contato_realizado", "em_atendimento", "qualificado",
  "aguardando_agendamento", "call_agendada", "call_confirmada",
  "nao_confirmado", "risco_no_show", "remarcar_reuniao", "reuniao_remarcada", "reuniao_cancelada",
  "morno", "nutricao", "nao_qualificado", "sem_resposta", "precisa_humano", "perdido", "opt_out",
] as const;

export type LeadStatus = typeof STATUS[number];
export type Temperature = "quente" | "morno" | "frio";

/** Rótulos legíveis (para mensagens ao Gabriel / logs). */
export const STATUS_LABEL: Record<LeadStatus, string> = {
  novo_lead: "Novo Lead",
  contato_realizado: "Contato Realizado",
  em_atendimento: "Em Atendimento",
  qualificado: "Qualificado",
  aguardando_agendamento: "Aguardando Agendamento",
  call_agendada: "Call Agendada",
  call_confirmada: "Call Confirmada",
  nao_confirmado: "Não Confirmado",
  risco_no_show: "Risco de No-show",
  remarcar_reuniao: "Remarcar Reunião",
  reuniao_remarcada: "Reunião Remarcada",
  reuniao_cancelada: "Reunião Cancelada",
  morno: "Morno",
  nutricao: "Nutrição",
  nao_qualificado: "Não Qualificado",
  sem_resposta: "Sem Resposta",
  precisa_humano: "Precisa de Humano",
  perdido: "Perdido",
  opt_out: "Opt-out",
};

export function isValidStatus(s: string): s is LeadStatus {
  return (STATUS as readonly string[]).includes(s);
}
