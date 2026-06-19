-- Permite "pausar" o bot para um lead específico (quando um humano assume a conversa pela inbox).
alter table public.aa_leads add column if not exists bot_paused boolean not null default false;
