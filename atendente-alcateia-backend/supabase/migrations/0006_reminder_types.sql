-- Lembretes de confirmação em 3 momentos (3h, 1h e 10min antes), com link da call.
-- Adiciona os novos tipos ao enum aa_task_type (o 30min antigo permanece como legado).
alter type aa_task_type add value if not exists 'meeting_confirmation_3h';
alter type aa_task_type add value if not exists 'meeting_confirmation_10min';
