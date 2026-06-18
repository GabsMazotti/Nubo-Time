# Checklist de testes — Atendente Alcateia

Legenda: ✅ implementado · 🧪 com teste automatizado · ⏳ precisa de staging + credenciais (Z-API/Calendly/Anthropic) para validar ponta a ponta.

## Já validado agora
- 🧪 Normalizador de telefone (`_shared/phone.test.ts`) — 13/13 passando, incl. `[object Object]`, objeto `{phone}`/`{value}`, array, número, formatos com `+()-`.
- ✅ Type-check (`deno check`) das 4 funções sem erros.
- ✅ Persona/qualificação validadas no Paperclip (Testes 1–3): regra R$10k, temperatura, 1ª mensagem, preço/garantia, confirmação/remarcação/no-show, handoff (áudio não interpretado).

## Os 42 cenários do briefing → onde estão cobertos

| # | Cenário | Onde | Status |
|---|---|---|---|
| 1 | Novo lead via webhook Respondi | `respondi-webhook` | ✅ ⏳ |
| 2 | WhatsApp como string | `phone.ts` | 🧪 |
| 3 | WhatsApp como objeto | `phone.ts` | 🧪 |
| 4 | WhatsApp como array | `phone.ts` | 🧪 |
| 5 | WhatsApp inválido | `phone.ts` + `respondi-webhook` (handoff) | 🧪 ✅ |
| 6 | Não aparece mais `[object Object]` | `phone.ts` | 🧪 |
| 7 | Orçamento > R$10k → qualifica | `qualification.ts` + persona | ✅ |
| 8 | Orçamento R$5–10k → confirmar | `qualification.ts` + persona | ✅ |
| 9 | Sem orçamento → não qualifica | `qualification.ts` + persona | ✅ |
| 10 | 1ª mensagem via Z-API | `respondi-webhook` + `zapi.ts` | ✅ ⏳ |
| 11 | Sem mensagem duplicada (mesmo lead) | dedup por telefone + `first_contact_sent_at` | ✅ |
| 12 | Resposta do lead salva no histórico | `zapi-inbound` (`aa_messages`/`aa_lead_history`) | ✅ ⏳ |
| 13 | Status → "Em Atendimento" ao responder | `zapi-inbound` | ✅ |
| 14 | Lead qualificado recebe Calendly | `zapi-inbound` (`send_calendly`) | ✅ |
| 15 | Link do Calendly registrado no histórico | `zapi-inbound` | ✅ |
| 16 | Follow-ups quando não responde | `respondi-webhook` (agenda) + `scheduler-tick` | ✅ ⏳ |
| 17 | Sem resposta após último follow-up → "Sem Resposta" | `scheduler-tick` | ✅ |
| 18 | Pede humano → "Precisa de Humano" | `zapi-inbound` + persona | ✅ |
| 19 | Não qualificado → encerramento educado | persona | ✅ |
| 20 | Duplicidade por WhatsApp | índice único `aa_leads(phone)` + `respondi-webhook` | ✅ |
| 21 | Duplicidade por e-mail | `calendly-webhook` (busca por email) | ✅ |
| 22 | Agente aparece na lista (Paperclip) | Painel Paperclip | ✅ |
| 23 | Lead agenda no Calendly | `calendly-webhook` | ✅ ⏳ |
| 24 | Webhook do Calendly recebido | `calendly-webhook` | ✅ ⏳ |
| 25 | Agendamento na aba "Agendamentos" | `aa_appointments` | ✅ |
| 26 | Status → "Call Agendada" | `calendly-webhook` | ✅ |
| 27 | Mensagem 1h antes | `scheduler-tick` (`meeting_confirmation_1h`) | ✅ ⏳ |
| 28 | Lead confirma presença | `zapi-inbound` + persona | ✅ |
| 29 | Status → "Call Confirmada" | `zapi-inbound` (sync agendamento) | ✅ |
| 30 | Gabriel recebe aviso | `zapi-inbound` (`notify_gabriel`) | ✅ ⏳ |
| 31 | Lead pede remarcar | `zapi-inbound` + persona | ✅ |
| 32 | Sistema reenvia Calendly/horários | `zapi-inbound` (`send_calendly`) | ✅ |
| 33 | Lead não responde à confirmação | `scheduler-tick` | ✅ |
| 34 | 2º lembrete 30min antes | `scheduler-tick` (`meeting_confirmation_30min`) | ✅ ⏳ |
| 35 | Continua sem responder | `scheduler-tick` (`meeting_noshow_check`) | ✅ |
| 36 | Status → "Não Confirmado / Risco de No-show" | `scheduler-tick` | ✅ |
| 37 | Gabriel recebe aviso de no-show | `scheduler-tick` (`gabrielNoShowRisk`) | ✅ ⏳ |
| 38 | Lead remarca | `calendly-webhook` (rescheduled) | ✅ |
| 39 | Lembrete antigo cancelado | `calendly-webhook` (cancela tasks) | ✅ |
| 40 | Novo lembrete criado | `calendly-webhook` | ✅ |
| 41 | Histórico registra tudo | `aa_lead_history` em todas as funções | ✅ |
| 42 | Nenhuma mensagem duplicada | dedup por `external_id` (inbound) + flags | ✅ |

## Como testar ponta a ponta (após credenciais)
1. `deno test` na pasta `_shared` (normalizador).
2. `supabase functions serve` localmente + `curl` simulando os payloads (Respondi, Z-API, Calendly).
3. Em staging: enviar um lead de teste real pelo formulário e acompanhar `aa_lead_history`.
