# COMO PEDIR UMA CAMPANHA AO GERENTE

Este é o formato que você copia, preenche e cola na conversa com o **Gerente**. Com esses 5 campos ele monta a campanha inteira, nomeia no padrão e devolve pronta para subir no Meta Ads (em PAUSADO — você só ativa).

---

## TEMPLATE (copie e preencha)

```
BRIEFING DE CAMPANHA

1) OFERTA / MARCA: ____________________________________
   (qual bônus e de qual marca. ex: BONUS100 da marca X)

2) FUNIL: [ ] Direto   [ ] PWA
   (Direto = anúncio → cadastro → depósito | PWA = instala app → cadastro → depósito)

3) Nº DE CRIATIVOS: ____
   (quantas peças prontas você tem do Eugene)

4) FORMATO DE CADA CRIATIVO:
   - criativo 1: __________________ (ex: ESTATICO-OFERTA)
   - criativo 2: __________________
   - criativo 3: __________________
   - criativo 4: __________________
   - criativo 5: __________________
   (nomes dos arquivos, se já tiver, ajudam — eles já trazem oferta e formato)

5) ORÇAMENTO · PÚBLICO · META:
   - orçamento/dia: US$ ____
   - público: ______________________ (ex: Homens 25–45, Android, Chile)
   - prioridade: [ ] volume   [ ] qualidade   [ ] equilíbrio
   - meta de CPA: US$ ____ (alvo 10, teto 30)
```

> Você **não precisa** informar ângulo nem fazer a copy — isso já vem no criativo do Eugene. Geo padrão é Chile; mude no campo de público se for outro país.

---

## EXEMPLO PREENCHIDO

```
BRIEFING DE CAMPANHA

1) OFERTA / MARCA: BONUS100 da marca X
2) FUNIL: [x] Direto
3) Nº DE CRIATIVOS: 5
4) FORMATO DE CADA CRIATIVO:
   - criativo 1: ESTATICO-OFERTA
   - criativo 2: ESTATICO-OFERTA
   - criativo 3: ESTATICO-OFERTA
   - criativo 4: ESTATICO-PRINT
   - criativo 5: ESTATICO-NOTA
5) ORÇAMENTO · PÚBLICO · META:
   - orçamento/dia: US$ 100
   - público: Homens 25–45, Android, Chile
   - prioridade: volume
   - meta de CPA: US$ 12
```

---

## O QUE O GERENTE DEVOLVE (pronto para o Meta Ads)

Com o briefing acima, ele entrega a estrutura nomeada e configurada, em PAUSADO:

```
CAMPANHA:  CL_DIRETO_BONUS100_LIVRE_REG_1506
  Objetivo: Conversão (otimiza Cadastro/Lead)   |   Lance: Livre (Highest Volume)
  Budget: US$100/dia (ABO)

  └ CONJUNTO:  HM-25-45_AND_AUTO
      Público: Homens 25–45 · Android 10+ · Chile · colocação automática
      └ 01_DIRETO_BONUS100_ESTATICO-OFERTA
      └ 02_DIRETO_BONUS100_ESTATICO-OFERTA
      └ 03_DIRETO_BONUS100_ESTATICO-OFERTA
      └ 04_DIRETO_BONUS100_ESTATICO-PRINT
      └ 05_DIRETO_BONUS100_ESTATICO-NOTA

  Tracking: pixel + CAPI no Cadastro (Lead). FTD pelo backend via UTM até o tracker entrar.
  Aprendizado: não mexer por 72h.
  STATUS: rascunho/pausado → AÇÃO SUA: ativar no Gerenciador.
```

Quando o MCP do Meta estiver conectado, esse mesmo blueprint sobe direto na sua conta (em pausado). Sem ele, o Gerente te entrega essa estrutura para você montar no Gerenciador ou para importação em massa.

---

## CHECKLIST RÁPIDO ANTES DE ATIVAR
- [ ] Os criativos estão carregados e com o nome no padrão (nº_FUNIL_OFERTA_FORMATO).
- [ ] Pixel + CAPI disparando o evento de Cadastro.
- [ ] Link/CTA com o token/deep-link da oferta (para atribuir cadastro e depósito).
- [ ] Budget e público conferem com o briefing.
- [ ] Campanha em PAUSADO → ative você mesmo.
```
