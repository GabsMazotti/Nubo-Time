-- ============================================================
-- Funil de etapas (stages) + remarketing
-- ============================================================
-- Camada de "etapas do funil" por cima do status do lead:
--  * aa_stages       — catálogo editável das etapas (8 etapas padrão), cada uma mapeia para um aa_lead_status.
--  * aa_stage_rules  — gatilhos configuráveis: palavras/frases que, ao aparecerem na conversa, marcam a etapa.
--  * aa_stage_history— auditoria das transições de etapa (rule | ai | system | manual).
--  * aa_remarketing  — leads QUALIFICADOS que NÃO marcaram reunião (fila de remarketing).
--  * aa_leads.*      — colunas de etapa e a "coluna remarketing".
-- Tudo aditivo e idempotente (não quebra o que já roda).

-- ---------- Colunas novas em aa_leads ----------
alter table public.aa_leads add column if not exists stage              text;
alter table public.aa_leads add column if not exists stage_changed_at   timestamptz;
alter table public.aa_leads add column if not exists qualified_at       timestamptz;
alter table public.aa_leads add column if not exists qualified_no_meeting boolean not null default false;
alter table public.aa_leads add column if not exists remarketing        boolean not null default false;

create index if not exists aa_leads_stage_idx       on public.aa_leads (stage);
create index if not exists aa_leads_remarketing_idx on public.aa_leads (remarketing) where remarketing = true;

-- ---------- Catálogo de etapas (editável pelo painel) ----------
create table if not exists public.aa_stages (
  key         text primary key,            -- identificador estável da etapa
  label       text not null,               -- rótulo exibido (editável)
  sort_order  int  not null default 0,     -- ordem no funil (menor = mais cedo)
  status      text not null,               -- aa_lead_status que esta etapa aplica no CRM
  color       text,                         -- cor do badge (hex)
  is_active   boolean not null default true,
  updated_at  timestamptz not null default now()
);

-- ---------- Gatilhos configuráveis (palavras/frases -> etapa) ----------
create table if not exists public.aa_stage_rules (
  id          bigint generated always as identity primary key,
  stage_key   text not null references public.aa_stages(key) on delete cascade,
  direction   text not null default 'inbound',   -- inbound (lead) | outbound (atendente) | any
  match_type  text not null default 'contains',  -- contains (substring) | regex
  pattern     text not null,                       -- palavra/frase ou regex
  priority    int  not null default 100,           -- maior = avaliado primeiro
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists aa_stage_rules_stage_idx on public.aa_stage_rules (stage_key);
create index if not exists aa_stage_rules_active_idx on public.aa_stage_rules (is_active, priority);

-- ---------- Histórico de transições de etapa ----------
create table if not exists public.aa_stage_history (
  id          bigint generated always as identity primary key,
  lead_id     uuid not null references public.aa_leads(id) on delete cascade,
  created_at  timestamptz not null default now(),
  from_stage  text,
  to_stage    text not null,
  reason      text not null default 'system',  -- rule | ai | system | manual
  rule_id     bigint,
  message_id  bigint,
  meta        jsonb
);
create index if not exists aa_stage_history_lead_idx on public.aa_stage_history (lead_id, created_at);

-- ---------- Fila de remarketing: qualificados que NÃO marcaram reunião ----------
create table if not exists public.aa_remarketing (
  lead_id      uuid primary key references public.aa_leads(id) on delete cascade,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  qualified_at timestamptz,                       -- quando o lead foi qualificado
  reason       text,                              -- por que entrou (qualificado_sem_agendar | reuniao_cancelada | ...)
  stage        text,                              -- etapa no momento em que entrou/atualizou
  status       text not null default 'pendente',  -- pendente | em_andamento | recuperado | descartado
  attempts     int  not null default 0,           -- nº de toques de remarketing já feitos
  last_touch_at timestamptz,
  next_touch_at timestamptz,
  recovered_at timestamptz,                        -- quando voltou a agendar
  notes        text
);
create index if not exists aa_remarketing_status_idx on public.aa_remarketing (status);
create index if not exists aa_remarketing_next_idx   on public.aa_remarketing (next_touch_at) where status in ('pendente','em_andamento');

-- ---------- updated_at automático ----------
do $$ begin
  create trigger aa_stages_touch before update on public.aa_stages
    for each row execute function public.aa_touch_updated_at();
exception when duplicate_object then null; end $$;
do $$ begin
  create trigger aa_stage_rules_touch before update on public.aa_stage_rules
    for each row execute function public.aa_touch_updated_at();
exception when duplicate_object then null; end $$;
do $$ begin
  create trigger aa_remarketing_touch before update on public.aa_remarketing
    for each row execute function public.aa_touch_updated_at();
exception when duplicate_object then null; end $$;

-- ---------- Segurança (RLS): só service_role (Edge Functions) acessa ----------
alter table public.aa_stages         enable row level security;
alter table public.aa_stage_rules    enable row level security;
alter table public.aa_stage_history  enable row level security;
alter table public.aa_remarketing    enable row level security;

-- ---------- Seed: 8 etapas padrão (primeiro contato -> reunião confirmada) ----------
insert into public.aa_stages (key, label, sort_order, status, color) values
  ('primeiro_contato',        '1️⃣ Primeiro contato',        10, 'contato_realizado',      '#64748b'),
  ('em_conversa',             '2️⃣ Em conversa',             20, 'em_atendimento',         '#3b82f6'),
  ('qualificado',             '3️⃣ Qualificado',             30, 'qualificado',            '#22c55e'),
  ('agenda_enviada',          '4️⃣ Agenda enviada',          40, 'aguardando_agendamento', '#14b8a6'),
  ('qualificado_sem_agendar', '5️⃣ Qualificado sem agendar', 50, 'aguardando_agendamento', '#f59e0b'),
  ('em_remarketing',          '6️⃣ Em remarketing',          60, 'nutricao',               '#f97316'),
  ('reuniao_marcada',         '7️⃣ Reunião marcada',         70, 'call_agendada',          '#16a34a'),
  ('reuniao_confirmada',      '8️⃣ Reunião confirmada',      80, 'call_confirmada',        '#15803d')
on conflict (key) do nothing;

-- ---------- Seed: gatilhos padrão (só na 1ª vez; depois é editável pelo painel) ----------
insert into public.aa_stage_rules (stage_key, direction, match_type, pattern, priority)
select * from (values
  -- Agenda enviada: quando o atendente manda o link do Calendly.
  ('agenda_enviada',          'outbound', 'contains', 'calendly.com',          200),
  -- Reunião marcada: lead avisa que agendou.
  ('reuniao_marcada',         'inbound',  'contains', 'agendei',               190),
  ('reuniao_marcada',         'inbound',  'contains', 'marquei',               190),
  ('reuniao_marcada',         'inbound',  'contains', 'acabei de agendar',     190),
  -- Reunião confirmada: lead confirma presença.
  ('reuniao_confirmada',      'inbound',  'contains', 'confirmo',              180),
  ('reuniao_confirmada',      'inbound',  'contains', 'confirmado',            180),
  ('reuniao_confirmada',      'inbound',  'contains', 'tô dentro',             180),
  ('reuniao_confirmada',      'inbound',  'contains', 'estarei',               180),
  ('reuniao_confirmada',      'inbound',  'contains', 'pode contar',           180),
  -- Em remarketing: lead empurra pra depois.
  ('em_remarketing',          'inbound',  'contains', 'agora não',             120),
  ('em_remarketing',          'inbound',  'contains', 'mais pra frente',       120),
  ('em_remarketing',          'inbound',  'contains', 'depois eu te chamo',    120),
  -- Qualificado: lead sinaliza orçamento/intenção (ajuste fino no painel).
  ('qualificado',             'inbound',  'contains', '10 mil',                110),
  ('qualificado',             'inbound',  'contains', '10k',                   110)
) as seed(stage_key, direction, match_type, pattern, priority)
where not exists (select 1 from public.aa_stage_rules);
