# RELATÓRIO — Sistema de agentes Alcateia

## 1. O que foi feito

A partir do seu handoff, montei um pacote completo de **12 arquivos** na pasta `alcateia-agentes/`: os 4 bots (prompts de papel), as 4 leis (regras compartilhadas) e os 3 contratos de dados em JSON Schema. Tudo alinhado à sua operação (dono direto, geo Chile, CPA alvo US$10 na banda US$5–30, qualidade de jogador acima de custo) e validado por código.

| Categoria | Arquivos | Função |
|---|---|---|
| **Bots** | `01-gerente-de-trafego.md`, `02-trafegador-direto.md`, `03-trafegador-pwa.md`, `04-analista.md` | Os 4 papéis que executam o trabalho |
| **Leis** | `00-SISTEMA.md`, `NOMENCLATURA.md`, `DECISOES.md`, `ALFA-playbook.md` | Contexto e regras que todos os bots seguem |
| **Contratos** | `schemas/ficha-de-campanha.schema.json`, `schemas/relatorio-de-status.schema.json`, `schemas/relatorio-de-analise.schema.json` | Padronizam o que passa de um bot para outro |
| **Docs** | `README-ENTREGA.md`, `RELATORIO.md` | Índice e este relatório |

O que ajustei em relação ao material original: travei o CPA alvo em US$10 (banda 5–30), fixei geo Chile, defini que toda campanha sobe **em PAUSADO** (você ativa), deixei explícito o estado atual (sem tracker, o Meta só lê Cadastro — FTD vem do seu backend por UTM) e corrigi uma referência de arquivo quebrada. Os 3 schemas passaram em validação automática (JSON válido, banda de CPA, padrão de nome de campanha e lista de vereditos conferidos).

## 2. Quem é cada bot

**Gerente de Tráfego** — o cérebro e o único que fala com você. Recebe seu briefing, define estratégia, divide orçamento entre os funis, fixa as metas e dá as ordens. Aciona os outros três.

**Trafegador Direto** — monta o funil direto (anúncio → cadastro → depósito). Pega a ordem do Gerente e os criativos prontos, estrutura a campanha, nomeia tudo no padrão e deixa pronta para subir.

**Trafegador PWA** — igual ao Direto, mas para o funil de app/PWA (instala → cadastra → deposita).

**Analista** — lê as métricas, compara com as metas e devolve um veredito por item (ESCALAR / MANTER / REFRESH / PAUSAR-MATAR / ESPERAR), sempre com a ação numérica. Não mexe nas campanhas, só diagnostica.

Importante: **os bots não criam copy nem criativo**. Eles estruturam, sobem, medem e decidem. O criativo vem do Eugene (o copywriter), já nomeado.

## 3. Como usar — o jeito simples

Você conversa **só com o Gerente**. Ele orquestra o resto.

1. Abra uma conversa e cole o conteúdo do `01-gerente-de-trafego.md` (ou rode a skill `alcateia-trafego-igaming`, em que o Gerente já é o papel padrão).
2. Passe o briefing de **5 campos**, nesta ordem: (1) oferta/marca, (2) funil (Direto ou PWA), (3) nº de criativos, (4) formato de cada criativo, (5) orçamento · público · meta.
3. O Gerente emite a **Ficha de Campanha** e aciona o Trafegador certo, que devolve a campanha montada e nomeada, pronta para subir (em pausado).
4. Você ativa no Gerenciador do Meta. Deixa rodar o aprendizado (não mexer por ~48–72h).
5. A cada ciclo, peça a análise: o **Analista** diz o que escalar/cortar e o **Gerente** executa a decisão.
6. A qualquer momento, peça **"status da alcateia"** para o Gerente consolidar tudo em uma tela.

### Exemplo de briefing
> "Oferta BONUS100 da marca X. Funil Direto. Tenho 5 criativos: 3 estáticos de oferta, 1 print, 1 nota de celular. Orçamento US$100/dia, público homens 25–45 Android no Chile, meta de volume com CPA até US$12."

Com isso o Gerente já monta a ficha e dispara o Trafegador Direto.

## 4. Como usar — modo avançado (com subagentes)

Se rodar em ambiente com subagentes, o Gerente pode disparar cada bot automaticamente, passando o arquivo `.md` do papel como instrução. Os 3 JSON schemas servem para o seu programador validar cada passagem de dado (Gerente→Trafegador, Trafegador→Gerente, Analista→Gerente) de forma determinística — é o que torna a automação confiável.

## 5. Regras que os bots já seguem sozinhos

- **Não julgar antes de 3–5 dias / 50 eventos**; veredito de item só com ≥25 conversões.
- **Escalar:** +20% de budget a cada 48–72h (nunca mexer mais que 20–30% de uma vez, senão reseta o aprendizado).
- **Matar:** gastou 3× o CPA alvo sem depósito (no seu caso, US$30 sem FTD) → corta.
- **Qualidade manda:** um CPA barato com jogador que não volta vale menos que um CPA maior com 2º depósito alto.
- **Nunca** misturar funis ou modos de lance na mesma campanha.

## 6. O que falta plugar (para automação total)

1. **MCP do Meta Ads** — para os bots subirem campanhas (em pausado) e o Analista ler métricas direto da conta.
2. **Tracker + postback S2S** (Keitaro/RedTrack/Voluum) — habilita otimizar por Depósito e as regras de corte por FTD. Sem ele, opera-se por Cadastro (CPR) como proxy.
3. **Painel diário** (opcional) — dashboard alimentado pelo MCP de leitura.

Enquanto isso, os bots já funcionam em modo manual: entregam o blueprint pronto e você sobe/ativa.
