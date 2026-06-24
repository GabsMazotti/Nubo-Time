-- ============================================================
-- Funil multi-tenant: Alcateia x Mentoria (Affiliaplay) sem misturar atendimentos.
-- Tudo aditivo e default 'alcateia' -> leads/config existentes seguem como Alcateia (zero mudança).
-- ============================================================

-- Etiqueta de funil no lead. Definida na ENTRADA e nunca trocada sozinha.
alter table public.aa_leads add column if not exists funnel text not null default 'alcateia';
create index if not exists aa_leads_funnel_idx on public.aa_leads (funnel);

-- Config editável passa a ser POR FUNIL. PK vira (funnel, key).
alter table public.aa_config add column if not exists funnel text not null default 'alcateia';

do $$ begin
  alter table public.aa_config drop constraint aa_config_pkey;
exception when undefined_object then null; end $$;

do $$ begin
  alter table public.aa_config add constraint aa_config_pkey primary key (funnel, key);
exception when invalid_table_definition then null; when duplicate_table then null; end $$;
