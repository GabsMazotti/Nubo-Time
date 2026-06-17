# INTEGRAÇÃO — Agente que PUBLICA campanhas no Meta Ads

Objetivo: habilitar o **Trafegador** (via Gerente) a criar e subir campanhas direto na sua conta Meta. Toda campanha é criada em **PAUSADO** — você revisa e ativa.

---

## Resumo (o que mudou a seu favor)
Desde **29/04/2026** a Meta lançou um **MCP oficial** (beta gratuito) que cria campanhas via Marketing API, com login pelo Facebook Business — **sem developer app, sem app review, sem token para gerenciar**. É o caminho recomendado. O handoff antigo previa o caminho difícil (developer app + token); ele ainda existe como alternativa, mas não é mais necessário.

---

## CAMINHO RECOMENDADO — MCP oficial da Meta

**Conector:** `https://mcp.facebook.com/ads` (adicionar como conector personalizado no app).
**Autenticação:** login com sua conta **Facebook Business** (OAuth). Nada de chave de API.
**Capacidade:** 29 ferramentas, incluindo criação de campanha, edição de budget e ativação de ad set.

### O que você precisa ter antes de conectar
1. **Conta Meta Business Manager** ativa.
2. **Conta de anúncios (ad account)** ativa, com **método de pagamento** configurado.
3. **Página do Facebook** (e, idealmente, conta Instagram) de onde os anúncios saem.
4. **Permissão de admin/anunciante** na conta de anúncios e na página.
5. **Pixel + CAPI** instalados no site (evento de Cadastro no mínimo) — para o anúncio ter sinal de conversão.
6. **Criativos prontos** (do Eugene), nomeados no padrão.

### Passos
1. No app (Claude Desktop/Cowork), adicione um **conector personalizado** com a URL `https://mcp.facebook.com/ads`.
2. Faça login e autorize com o **Facebook Business** (escolha o Business Manager e a conta de anúncios certos).
3. Me avise quando autorizar — eu rodo um teste de leitura (listar contas/campanhas) para confirmar que o agente enxerga a conta certa.
4. A partir daí, o Gerente passa a ficha ao Trafegador e o Trafegador **cria a campanha em PAUSADO** na sua conta. Você confere e ativa.

> Observação: por ser conector personalizado, ele não aparece na lista pronta do registro — entra pela opção de **adicionar conector/MCP por URL**. Se preferir, eu te guio nesse passo na tela.

---

## CAMINHO ALTERNATIVO — Marketing API própria (só se precisar de controle total)

Use isto apenas se quiser hospedar sua própria automação (ex.: o MCP open-source `pipeboard-co/meta-ads-mcp`). Exige bem mais setup:

1. **Conta de desenvolvedor Meta** + criar um **App** no developers.facebook.com.
2. Vincular o App ao **Business Manager**.
3. **System User** no Business Manager e gerar **token de longa duração**.
4. Permissões no token: **`ads_management`**, **`ads_read`**, **`business_management`**.
5. **Verificação de negócio** (business verification) e, para sair do limite básico, **App Review** (acesso avançado).
6. Guardar o token com segurança e rotacioná-lo periodicamente.
7. Hospedar/rodar o servidor MCP e conectá-lo ao app.

Mais poder e independência, porém mais manutenção. Para começar, o caminho oficial entrega o mesmo resultado com uma fração do trabalho.

---

## COMPLIANCE — específico de iGaming/casino (não pule)
A Meta trata **jogo de apostas/gambling** como categoria restrita: exige **autorização prévia por escrito da Meta** e veiculação **apenas em regiões permitidas**, com segmentação de idade adequada. Ter o MCP conectado **não dispensa** essa autorização — sem ela, as campanhas (mesmo criadas via API) são reprovadas. Confirme que sua conta/página tem a permissão de gambling para o Chile antes de escalar.

---

## O que cada integração habilita (mapa)

| Você quer... | Precisa de | Status |
|---|---|---|
| **Publicar/subir campanha** (este pedido) | MCP oficial Meta (`mcp.facebook.com/ads`) **ou** Marketing API própria | a conectar |
| Ler métricas p/ o Analista | mesmo MCP oficial (tem insights) **ou** Supermetrics/Windsor.ai | opcional agora |
| Medir **FTD/depósito** real e otimizar por depósito | Tracker (Keitaro/RedTrack/Voluum) + **postback S2S** | etapa final |
| Sinal de conversão no anúncio | Pixel + **CAPI** no site | pré-requisito |

---

## Regra de segurança (já embutida nos agentes)
O Trafegador **sempre cria em PAUSADO**. Nada vai ao ar sem você ativar. Sem postback de FTD confirmado, o agente não libera escala por depósito — opera por Cadastro (CPR) como proxy.

---

## Próxima ação
Adicione o conector `https://mcp.facebook.com/ads` e autorize com o Facebook Business. Me avise quando estiver feito que eu testo a leitura da conta e já preparo o Trafegador para a primeira campanha.
