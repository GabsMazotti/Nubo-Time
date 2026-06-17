# ALCATEIA — Sistema de Tráfego Pago iGaming (operação do dono)

Sistema de **4 agentes** que rodam tráfego pago no Meta para o **dono do casino** (anunciante direto), com foco em **qualidade de jogador** e **métrica correta de ponta a ponta**. Mercado: Chile/LATAM hispano. Trabalho em PT-BR; copy de anúncio em ES.

Todos os agentes compartilham a metodologia de mídia do arquivo `ALFA-playbook.md` (estrutura, lance, escala). Este documento define **quem faz o quê, o fluxo, as métricas e o formato dos handoffs**.

---

## 1. Contexto econômico (você é o dono)

Você não paga payout de afiliado — você compra o jogador direto. O CPA que você aceita é **US$5–30 por FTD**, com **alvo de trabalho ~US$10**. Logo:

- **Banda de CPA alvo:** eficiente US$5–12 · alvo US$10 · aceitável até US$30 (teto duro).
- **CPA não é o KPI final. Qualidade é.** Um FTD de US$30 só vale se o jogador retorna. Por isso a alcateia mede **retenção, 2º depósito, NGR e payback**, não só custo por FTD.
- **Você tem dado real de depósito** (é seu sistema). Isso permite otimizar no Meta direto pelo evento de **Depósito (Purchase) com valor**, via CAPI server-side — a vantagem que o afiliado não tem. (Depende do tracker entrar — ver §8.)

**Regra mestre de qualidade (gate):** um conjunto/criativo só é "bom" se: `CPA ≤ teto da banda` **E** `taxa de 2º depósito ≥ meta` **E** `payback projetado ≤ janela definida`. Custo barato com jogador que não volta = ruim.

---

## 2. Os 4 agentes (papéis)

| # | Agente | O que faz | Recebe de | Entrega para |
|---|--------|-----------|-----------|--------------|
| 1 | **Gerente de tráfego** | Define estratégia, divide orçamento entre funis, fixa metas/KPIs, dá ordens, decide escalar/pausar | Você (dono) + Analista | Trafegadores |
| 2 | **Trafegador direto** | Cria e executa o funil direto (cadastro→FTD) seguindo a ficha do gerente | Gerente | Campanhas no Meta + status |
| 3 | **Trafegador PWA** | Cria e executa o funil PWA (instala→cadastro→FTD) | Gerente | Campanhas no Meta + status |
| 4 | **Analista** | Lê as métricas, dá veredito por item (escalar/manter/refresh/pausar/esperar) com ação numérica, aponta o que excluir | Dados das campanhas | Gerente |

O **Gerente é o cérebro e o único que fala com você**. Os trafegadores executam. O analista audita. O loop nunca para.

---

## 3. Fluxo (o processo, sempre em ciclo)

```
VOCÊ → define objetivo (orçamento, geo, marca, meta de CPA e qualidade)
  │
  ▼
[1] GERENTE → estratégia + divisão de budget (Direto vs PWA) + KPIs-meta
  │           emite FICHA DE CAMPANHA para cada trafegador
  ├──────────────┬───────────────────────────┐
  ▼              ▼
[2] DIRETO    [3] PWA → montam e sobem as campanhas (em PAUSADO; o dono ATIVA)
  │              │
  ▼              ▼
        CAMPANHAS NO META (pixel + CAPI, dados reais de FTD)
  │
  ▼  (após janela de aprendizado / cadência)
[4] ANALISTA → puxa métricas, compara com metas, gera RELATÓRIO DE ANÁLISE
  │            (veredito + ação por campanha/conjunto/anúncio)
  ▼
[1] GERENTE → decide, atualiza estratégia/budget, emite ORDENS DE AJUSTE
  │
  └────────► volta aos trafegadores  ↺  (ciclo recomeça)
```

---

## 4. Cadência (quando cada coisa roda)

| Momento | Quem | Ação |
|---|---|---|
| D0 | Gerente → Trafegadores | Estratégia + fichas + subida das campanhas (em PAUSADO) |
| D0–D3 | — | **Não mexer.** Deixar sair do aprendizado (50 eventos/7d ou 48–72h) |
| D3 (1ª análise) | Analista → Gerente | Veredito inicial: cortar perdedores, identificar sinais |
| A cada 48–72h (fase de teste) | Analista → Gerente → Trafegadores | Ciclo de otimização |
| Diário (em escala) | Analista → Gerente | Monitorar CPA, qualidade, saúde de conta; ordens pontuais |
| Semanal | Gerente → Você | Resumo executivo: gasto, FTD, CPA, qualidade, ROAS/payback, próximos passos |

---

## 5. Árvore de métricas (o "metrificado corretamente")

Quatro camadas. Todo relatório segue exatamente esta ordem e estes nomes.

**Camada 1 — Topo (entrega/criativo)**
`Gasto` · `Impressões` · `CPM` · `CTR (link)` · `CPC` · `Frequência`

**Camada 2 — Meio (funil)**
`Cliques` · `Cadastros` · `CPR` (custo por cadastro) · `Clique→Cadastro %` · `Cadastro→FTD %`
*(PWA inclui: `Instalações` · `CPI` · `Instala→Cadastro %`)*

**Camada 3 — Fundo (aquisição)**
`FTD` (1º depósito) · `CPA / CFTD` (custo por FTD — **alvo US$10, banda US$5–30**) · `Valor médio do FTD` · `ROAS D0`

**Camada 4 — Qualidade / retenção (o que separa o dono do afiliado)**
`% FTD com 2º depósito` · `Depósitos por jogador D7 / D30` · `NGR por jogador` · `Payback (dias)` · `% jogadores ativos D30`

**Saúde de conta:** `Status de aprendizado` · `Taxa de aprovação` · `Tendência de CPM` · `Frequência`.

> Metas-padrão (ajuste por geo/marca): CPA ≤ US$10 (alvo) / ≤ US$30 (teto) · Cadastro→FTD ≥ 10% · % 2º depósito ≥ 25% · Payback ≤ 30 dias · ROAS D0 ≥ 0,3 (resto vem na retenção).

---

## 6. Contrato de dados — handoffs

Os 3 contratos abaixo têm versão formal em `schemas/*.schema.json` (JSON Schema) para padronizar inputs/outputs no código.

### 6.1 FICHA DE CAMPANHA (Gerente → Trafegador) — `ficha-de-campanha.schema.json`
Briefing do dono = **5 campos perguntados nesta ordem**: (1) oferta/marca, (2) funil, (3) nº de criativos, (4) formato de cada criativo, (5) orçamento·público·meta. Ângulo **não se pergunta** — vem no nome do arquivo do criativo (ver `NOMENCLATURA.md`). A ficha que o Gerente emite:
```
ID: [GEO_FUNIL_OFERTA_LANCE_EVENTO_DDMM]
Funil: Direto | PWA      Marca/oferta: __ (código)    Geo: __
Objetivo de negócio: volume | qualidade | equilíbrio
Evento de otimização: Cadastro | Depósito(Purchase+valor)
Modo de lance: Livre | Cost cap | Bid cap
CPA alvo: US$__ (alvo 10, teto 30)    Budget/dia: US$__
Público: gênero/idade/OS/colocação
KPIs-meta: CPR __ · Cadastro→FTD __% · CPA __ · %2ºdep __ · payback __
Criativos: nº __ + formatos + nomes dos arquivos (já nomeados pelo Eugene/Banco Mestre)
Tracking: eventos + postback/CAPI a validar
Prazo de aprendizado: não mexer por __h
```
> O trafegador NÃO escreve copy. Copy/criativo é de outro agente (Eugene). O trafegador só estrutura, nomeia, sobe e mede.

### 6.2 RELATÓRIO DE STATUS (Trafegador → Gerente/Analista) — `relatorio-de-status.schema.json`
```
ID · status (no ar/aprendendo/rascunho/reprovado) · estrutura subida (campanhas/conjuntos/anúncios) ·
gasto até agora · pendências (postback? aprovação?) · link/observações
```

### 6.3 RELATÓRIO DE ANÁLISE (Analista → Gerente) — `relatorio-de-analise.schema.json`
```
Janela analisada: __    Visão geral: gasto · FTD · CPA blended · qualidade

Por item (campanha → conjunto → anúncio):
  [nome] | métricas-chave | VEREDITO | AÇÃO numérica
  Vereditos: ESCALAR / MANTER / REFRESH / PAUSAR-MATAR / ESPERAR
  Ex.: "AVIATOR_BROAD | CPA $9, %2ºdep 31% | ESCALAR | +20% budget, duplicar p/ CBO cost cap $11"
  Ex.: "JACKPOT_v02 | CPA $41, 0 FTD após $60 | PAUSAR-MATAR"

Recomendações ao gerente: realocação de budget · novos testes · ajuste de meta · alertas de conta
```

---

## 7. Como operar (você)

Fale só com o **Gerente**. Diga: marca, geo, orçamento e o que prioriza (volume ou qualidade). Ele monta tudo, aciona os trafegadores e o analista, e te devolve o resumo. Para acompanhar, peça ao Gerente o "status da alcateia" a qualquer momento — ele consolida o que cada agente fez no ciclo.

---

## 8. Integrações e estado atual (o que falta plugar)

| Função | Integração | Status | Observação |
|---|---|---|---|
| **Subir campanha** (criar/draft) | MCP oficial de Meta Ads (OAuth Meta Business) | a conectar | Cria tudo em **PAUSADO**; o dono ATIVA manualmente. Sem ele: entrega blueprint / planilha de importação em massa. |
| **Ler dados** p/ Analista/painel | MCP oficial de Meta Ads (leitura) **ou** Supermetrics | a conectar | Alimenta o painel diário e a análise sob demanda. |
| **Sinal de conversão** | Pixel + CAPI no site | parcial | Sem tracker: só evento **Cadastro (Lead)**. FTD fica no backend. |
| **FTD/depósito (postback)** | Tracker (Keitaro/RedTrack/Voluum) + postback S2S | **última etapa** | Habilita otimizar por Depósito e as kill rules de FTD. |

**Importante (estado atual):** sem tracker, o Meta só enxerga **Cadastro**. O FTD/CPA é medido no **backend do dono** e cruzado por UTM. As regras de decisão baseadas em FTD ficam **suspensas** até o tracker entrar — opera-se por CPR (custo por cadastro) como proxy.
