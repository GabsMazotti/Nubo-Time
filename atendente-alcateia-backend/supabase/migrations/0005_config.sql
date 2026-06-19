-- Configuração editável pelo painel (prompt/inteligência dos atendentes e mensagens-padrão).
-- Chave-valor; valor vazio/ausente => o código usa o padrão embutido (PERSONA_DEFAULTS).
create table if not exists public.aa_config (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);

alter table public.aa_config enable row level security;

do $$ begin
  create trigger aa_config_touch before update on public.aa_config
    for each row execute function public.aa_touch_updated_at();
exception when duplicate_object then null; end $$;
