-- Agendador: roda o worker scheduler-tick a cada minuto (lembretes/follow-ups/no-show).
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove agendamento anterior (idempotente) e recria.
do $$ begin
  perform cron.unschedule('atendente-scheduler-tick');
exception when others then null; end $$;

select cron.schedule(
  'atendente-scheduler-tick',
  '* * * * *',
  $job$
    select net.http_post(
      url     := 'https://dttqxqnxlmkrclvhtqqx.supabase.co/functions/v1/scheduler-tick',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body    := '{}'::jsonb
    );
  $job$
);
