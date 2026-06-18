-- Corrige o índice único de calendly_event_id para permitir upsert (ON CONFLICT).
-- O índice parcial (WHERE ... IS NOT NULL) não é aceito como alvo de ON CONFLICT pelo PostgREST.
-- Um índice único normal permite múltiplos NULLs (cada NULL é distinto), então é seguro.
drop index if exists public.aa_appointments_calendly_uidx;
create unique index if not exists aa_appointments_calendly_uidx
  on public.aa_appointments (calendly_event_id);
