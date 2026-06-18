# Atendente Alcateia — Backend (SDR automático)

Backend que **automatiza o primeiro atendimento comercial** da Alcateia Media: recebe o lead do
formulário (Respondi), atende no WhatsApp (Z-API), qualifica (regra ≥ R$10k/mês), agenda e
**confirma a call** com o closer Gabriel (Calendly) — substituindo o atendimento manual de hoje.

O "cérebro" (o que falar, como qualificar, tom de voz) segue a **persona** definida em
`../alcateia-agentes/agentes/08-atendente-alcateia.md` (replicada em `supabase/functions/_shared/persona.ts`).

> **Status:** código pronto para deploy. Falta apenas plugar as credenciais externas
> (Z-API, Calendly, chave Anthropic) e publicar. Veja "Como publicar" abaixo.

---

## Como funciona (fluxo)

```
Respondi (formulário)
   │  webhook
   ▼
[respondi-webhook]  → normaliza telefone · evita duplicado · salva lead · 1ª mensagem (WhatsApp)
   │                  · agenda follow-ups (30min / 4h / dia seguinte)
   ▼
Lead responde no WhatsApp
   │  Z-API repassa
   ▼
[zapi-inbound]  → cérebro (persona) decide a resposta · qualifica · atualiza pipeline
   │              · envia link do Calendly quando qualificado · handoff p/ humano quando preciso
   ▼
Lead agenda no Calendly
   │  webhook
   ▼
[calendly-webhook]  → registra agendamento · status "Call Agendada"
   │                   · agenda lembrete 1h antes e 2º lembrete 30min antes
   ▼
[scheduler-tick]  (cron a cada minuto)  → dispara lembretes/confirmação/follow-ups no horário
                  → lead confirma → avisa Gabriel · não confirma → risco de no-show → avisa Gabriel
```

## Componentes

| Arquivo | O que faz |
|---|---|
| `supabase/migrations/0001_atendente_schema.sql` | Tabelas: `leads`, `lead_history`, `messages`, `appointments`, `scheduled_tasks` (+ pipeline e temperatura) |
| `functions/_shared/phone.ts` | **Normalizador de telefone** robusto (string/objeto/array/aninhado → `5583988808063`). Resolve o bug `[object Object]` |
| `functions/_shared/persona.ts` | A persona do Atendente (system prompt do cérebro) |
| `functions/_shared/anthropic.ts` | Chama o Claude com a persona e devolve decisão estruturada (resposta + status + ações) |
| `functions/_shared/qualification.ts` | Faixa de orçamento, regra dos R$10k, temperatura |
| `functions/_shared/pipeline.ts` | Status do pipeline e transições |
| `functions/_shared/zapi.ts` | Enviar/normalizar mensagens via Z-API (com trava anti-duplicado) |
| `functions/_shared/calendly.ts` | Link do Calendly e leitura de eventos |
| `functions/_shared/db.ts` | Cliente admin do Supabase + histórico |
| `functions/respondi-webhook/` | Entrada do lead (Respondi) |
| `functions/zapi-inbound/` | Respostas do lead (WhatsApp) |
| `functions/calendly-webhook/` | Eventos de agendamento (Calendly) |
| `functions/scheduler-tick/` | Worker do cron (lembretes/follow-ups) |

## Variáveis de ambiente

Veja `.env.example`. Nenhum segredo fica no código — tudo vem de variáveis de ambiente
(`supabase secrets set ...`).

## Como publicar (resumo — exige as credenciais)

> Requer o [Supabase CLI](https://supabase.com/docs/guides/cli). Eu te guio passo a passo quando você quiser.

```bash
# 1) Logar e ligar ao projeto (use um projeto Supabase DEDICADO e isolado)
supabase login
supabase link --project-ref <SEU_PROJECT_REF>

# 2) Aplicar o banco
supabase db push

# 3) Configurar segredos (você cola os valores; nunca ficam no código)
supabase secrets set ANTHROPIC_API_KEY=... ANTHROPIC_MODEL=claude-sonnet-4-6 \
  ZAPI_BASE_URL=... ZAPI_INSTANCE_ID=... ZAPI_TOKEN=... ZAPI_CLIENT_TOKEN=... \
  GABRIEL_WHATSAPP_NUMBER=55... \
  CALENDLY_EVENT_URL=https://calendly.com/alcateiamedia00/alcateia-media \
  CALENDLY_WEBHOOK_SECRET=...

# 4) Publicar as funções
supabase functions deploy respondi-webhook zapi-inbound calendly-webhook scheduler-tick

# 5) Agendar o worker (cron a cada minuto) — ver scheduler-tick/README
# 6) Repontar o webhook do Respondi para a URL de respondi-webhook
# 7) Apontar o webhook da Z-API (mensagens recebidas) para zapi-inbound
# 8) Criar a webhook subscription no Calendly apontando para calendly-webhook
```

## Testes
- `functions/_shared/phone.test.ts` — testes do normalizador (`deno test`).
- `TESTS.md` — checklist completo (os 42 cenários do briefing).
