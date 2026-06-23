-- Clientes/projetos da máquina de criativos: nome + logo (PNG) pra reusar nas artes.
create table if not exists public.aa_clients (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  logo_url   text,
  created_at timestamptz not null default now()
);
create unique index if not exists aa_clients_name_uidx on public.aa_clients (lower(name));
alter table public.aa_clients enable row level security;
