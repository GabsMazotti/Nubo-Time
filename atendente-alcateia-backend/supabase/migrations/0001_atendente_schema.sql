-- ============================================================
-- Atendente Alcateia — schema do backend de SDR
-- ============================================================
-- Tabelas isoladas (prefixo aa_) para não colidir com nada existente.

-- ---------- Enums ----------
do $$ begin
  create type aa_lead_status as enum (
    'novo_lead','contato_realizado','em_atendimento','qualificado',
    'aguardando_agendamento','call_agendada','call_confirmada',
    'nao_confirmado','risco_no_show','remarcar_reuniao','reuniao_remarcada','reuniao_cancelada',
    'morno','nutricao','nao_qualificado','sem_resposta','precisa_humano','perdido','opt_out'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type aa_temperature as enum ('quente','morno','frio');
exception when duplicate_object then null; end $$;

do $$ begin
  create type aa_task_type as enum (
    'meeting_confirmation_1h','meeting_confirmation_30min','meeting_noshow_check',
    'followup_first_contact_30min','followup_first_contact_4h','followup_first_contact_next_day'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type aa_task_status as enum ('pending','processing','completed','failed','canceled');
exception when duplicate_object then null; end $$;

-- ---------- Leads ----------
create table if not exists public.aa_leads (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  name               text,
  phone              text,            -- normalizado (somente dígitos, com DDI). Ex.: 5583988808063
  phone_valid        boolean not null default false,
  phone_raw          jsonb,           -- valor original recebido (auditoria do bug [object Object])
  email              text,
  source             text not null default 'respondi',
  market             text,            -- mercado de atuação
  role               text,            -- afiliado / operador / iniciante...
  works_with         text,            -- com o que trabalha no iGaming
  start_timeframe    text,            -- prazo para iniciar
  budget_raw         text,            -- faixa de investimento informada (texto)
  budget_min         numeric,         -- piso interpretado (R$/mês)
  budget_max         numeric,         -- teto interpretado (R$/mês)
  status             aa_lead_status not null default 'novo_lead',
  temperature        aa_temperature,
  qualified          boolean not null default false,
  needs_human        boolean not null default false,
  opted_out          boolean not null default false,
  form_payload       jsonb,           -- payload completo do Respondi
  first_contact_sent_at timestamptz,
  last_inbound_at    timestamptz,
  last_outbound_at   timestamptz
);

-- Dedup por telefone (um lead por número válido)
create unique index if not exists aa_leads_phone_uidx
  on public.aa_leads (phone) where phone is not null;
create index if not exists aa_leads_status_idx on public.aa_leads (status);
create index if not exists aa_leads_email_idx on public.aa_leads (email) where email is not null;

-- ---------- Histórico ----------
create table if not exists public.aa_lead_history (
  id          bigint generated always as identity primary key,
  lead_id     uuid not null references public.aa_leads(id) on delete cascade,
  created_at  timestamptz not null default now(),
  type        text not null,           -- ex.: lead_received, first_contact_sent, inbound, status_change, calendly, error
  message     text,
  meta        jsonb
);
create index if not exists aa_lead_history_lead_idx on public.aa_lead_history (lead_id, created_at);

-- ---------- Mensagens (conversa WhatsApp) ----------
create table if not exists public.aa_messages (
  id              bigint generated always as identity primary key,
  lead_id         uuid not null references public.aa_leads(id) on delete cascade,
  created_at      timestamptz not null default now(),
  direction       text not null,       -- inbound | outbound
  channel         text not null default 'whatsapp',
  body            text,
  external_id     text,                -- id da mensagem na Z-API (dedup de inbound)
  meta            jsonb
);
create unique index if not exists aa_messages_external_uidx
  on public.aa_messages (external_id) where external_id is not null;
create index if not exists aa_messages_lead_idx on public.aa_messages (lead_id, created_at);

-- ---------- Agendamentos ----------
create table if not exists public.aa_appointments (
  id                  uuid primary key default gen_random_uuid(),
  lead_id             uuid references public.aa_leads(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  scheduled_at        timestamptz,
  status              text not null default 'agendada',  -- agendada | confirmada | nao_confirmada | remarcada | cancelada
  confirmation_status text not null default 'pendente',  -- pendente | confirmada | sem_resposta | recusada
  meeting_url         text,
  source              text not null default 'calendly',
  calendly_event_id   text,
  gabriel_notified    boolean not null default false
);
create unique index if not exists aa_appointments_calendly_uidx
  on public.aa_appointments (calendly_event_id) where calendly_event_id is not null;
create index if not exists aa_appointments_lead_idx on public.aa_appointments (lead_id);

-- ---------- Tarefas agendadas (lembretes / follow-ups) ----------
create table if not exists public.aa_scheduled_tasks (
  id              bigint generated always as identity primary key,
  lead_id         uuid not null references public.aa_leads(id) on delete cascade,
  appointment_id  uuid references public.aa_appointments(id) on delete cascade,
  type            aa_task_type not null,
  scheduled_for   timestamptz not null,
  status          aa_task_status not null default 'pending',
  payload         jsonb,
  attempts        int not null default 0,
  last_error      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  executed_at     timestamptz
);
create index if not exists aa_tasks_due_idx
  on public.aa_scheduled_tasks (status, scheduled_for);
create index if not exists aa_tasks_lead_idx on public.aa_scheduled_tasks (lead_id);

-- ---------- updated_at automático ----------
create or replace function public.aa_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

do $$ begin
  create trigger aa_leads_touch before update on public.aa_leads
    for each row execute function public.aa_touch_updated_at();
exception when duplicate_object then null; end $$;
do $$ begin
  create trigger aa_appointments_touch before update on public.aa_appointments
    for each row execute function public.aa_touch_updated_at();
exception when duplicate_object then null; end $$;
do $$ begin
  create trigger aa_tasks_touch before update on public.aa_scheduled_tasks
    for each row execute function public.aa_touch_updated_at();
exception when duplicate_object then null; end $$;

-- ---------- Segurança (RLS) ----------
-- As Edge Functions usam a service_role (ignora RLS). Habilitamos RLS sem políticas públicas,
-- de modo que o acesso anônimo/cliente fique bloqueado por padrão.
alter table public.aa_leads            enable row level security;
alter table public.aa_lead_history     enable row level security;
alter table public.aa_messages         enable row level security;
alter table public.aa_appointments     enable row level security;
alter table public.aa_scheduled_tasks  enable row level security;
