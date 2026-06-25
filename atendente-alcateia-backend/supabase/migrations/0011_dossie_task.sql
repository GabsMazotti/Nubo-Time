-- Tipo de tarefa do dossiê pré-call (1h antes da call, só para leads que confirmaram).
-- Aditivo e idempotente.
alter type public.aa_task_type add value if not exists 'dossie_prep';
