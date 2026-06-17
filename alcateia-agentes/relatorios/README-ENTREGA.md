# ALCATEIA — Pacote de agentes (entrega)

Sistema multiagente de tráfego pago no Meta para o **dono do casino** (anunciante direto, geo Chile/LATAM). Foco em **qualidade de jogador** e métrica full-funnel. Os agentes **não criam copy/criativo** (isso é do Eugene) — estruturam, nomeiam, sobem, medem e decidem.

## O que tem aqui

```
alcateia-agentes/
├─ README-ENTREGA.md          (este arquivo — índice e mapa)
├─ 00-SISTEMA.md              (LEI: fluxo · cadência · árvore de métricas · contratos · integrações)
├─ NOMENCLATURA.md            (LEI: nº · funil · oferta · formato)
├─ DECISOES.md                (LEI: escalar/manter/refresh/pausar/esperar com thresholds)
├─ ALFA-playbook.md           (LEI: metodologia de mídia — estrutura, lance, escala, tracking)
├─ 01-gerente-de-trafego.md   (AGENTE: orquestrador, fala com o dono)
├─ 02-trafegador-direto.md    (AGENTE: executa funil direto)
├─ 03-trafegador-pwa.md       (AGENTE: executa funil PWA)
├─ 04-analista.md             (AGENTE: audita e dá veredito)
└─ schemas/
   ├─ ficha-de-campanha.schema.json    (contrato 6.1: Gerente → Trafegador)
   ├─ relatorio-de-status.schema.json  (contrato 6.2: Trafegador → Gerente)
   └─ relatorio-de-analise.schema.json (contrato 6.3: Analista → Gerente)
```

## Como os 4 agentes se ligam

```
DONO → [1 GERENTE] briefing(5 campos)+estratégia+budget → FICHA DE CAMPANHA (schema 6.1)
     → [2 DIRETO] / [3 PWA] montam+nomeiam+sobem (PAUSADO) → RELATÓRIO DE STATUS (schema 6.2)
     → DONO ativa no Meta → campanhas no ar (pixel+CAPI)
     → [4 ANALISTA] lê métricas → RELATÓRIO DE ANÁLISE (schema 6.3) com veredito por item
     → [1 GERENTE] decide → ORDENS DE AJUSTE → ↺
```

## Mapa handoff → arquivo

| Seção do handoff | Onde está |
|---|---|
| §3.1 Gerente | `01-gerente-de-trafego.md` |
| §3.2 Trafegador Direto | `02-trafegador-direto.md` |
| §3.3 Trafegador PWA | `03-trafegador-pwa.md` |
| §3.4 Analista | `04-analista.md` |
| §4 Sistema / métricas / contratos | `00-SISTEMA.md` |
| §4 Nomenclatura | `NOMENCLATURA.md` |
| §4 Decisões | `DECISOES.md` |
| §4 Playbook ALFA | `ALFA-playbook.md` |
| §5 Contratos de dados (como JSON schema) | `schemas/*.schema.json` |
| §6 Integrações / estado atual | `00-SISTEMA.md` §8 |
| §7 Árvore de métricas | `00-SISTEMA.md` §5 |

## Como usar
- **Como prompt de papel:** cole o conteúdo de cada `0X-*.md` no agente que vai assumir aquele papel. O `01-gerente` é a porta de entrada (orquestra os demais). As 4 leis são contexto compartilhado.
- **Como contrato no código:** valide os handoffs entre agentes contra os 3 JSON schemas (Draft 2020-12). É o que liga os agentes de forma determinística.

## Parâmetros desta operação
- Geo padrão: **Chile** (LATAM hispano). Trabalho em PT-BR; copy de anúncio em ES (via Eugene).
- CPA: alvo **US$10**, banda **US$5–30** (teto duro). Qualidade manda sobre custo (gate: CPA na banda **E** %2º depósito ≥ meta **E** payback ≤ janela).
- **Estado atual:** sem tracker, o Meta só enxerga **Cadastro**; FTD/CPA vêm do backend do dono por UTM. Regras por FTD ficam suspensas até o tracker (Keitaro/RedTrack/Voluum + postback S2S) entrar. Ver `00-SISTEMA.md` §8.

## Próximas etapas (dev)
1. Conectar **MCP de Meta Ads** (subir em PAUSADO + leitura para o Analista/painel).
2. Plugar **tracker + postback S2S** para habilitar otimização e kill rules por FTD.
3. (Opcional) Painel diário alimentado pelo MCP de leitura.
