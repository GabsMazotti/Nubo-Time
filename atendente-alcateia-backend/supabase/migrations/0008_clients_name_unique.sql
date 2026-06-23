-- Índice único em name (coluna exata) pra permitir upsert ON CONFLICT (name) ao recadastrar logo.
drop index if exists public.aa_clients_name_uidx;
create unique index if not exists aa_clients_name_uidx on public.aa_clients (name);
