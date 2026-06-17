# NOMENCLATURA DE TRÁFEGO — Alcateia

Padrão único de nome no Meta. Nome do anúncio enxuto: **número · funil · oferta · formato**. Você abre o relatório e sabe na hora o que está rodando.

## Lei suprema
O criativo já chega nomeado pelo time de copy (Eugene/Banco Mestre). O **tráfego não inventa código**: herda OFERTA e FORMATO do criativo e adiciona FUNIL + número do anúncio.

---

## 1. Os 3 níveis

### CAMPANHA
```
[GEO]_[FUNIL]_[OFERTA]_[LANCE]_[EVENTO]_[DDMM]
ex: CL_DIRETO_BONUS100_LIVRE_REG_1506
```

### CONJUNTO (ad set)
```
[PUBLICO]_[OS]_[COLOCACAO]
ex: HM-18-45_AND_AUTO
```

### ANÚNCIO  ← só os 4 campos
```
[##]_[FUNIL]_[OFERTA]_[FORMATO]
ex: 01_DIRETO_BONUS100_ESTATICO-OFERTA
```

**Campo a campo do anúncio:**
| Posição | Campo | O que é | Ex. |
|---|---|---|---|
| `##` | número do anúncio | sequencial dentro da campanha | 01, 02, 03 |
| FUNIL | qual funil | DIRETO ou PWA | DIRETO |
| OFERTA | qual oferta | código do Banco Mestre | BONUS100 |
| FORMATO | qual formato | código do Banco Mestre | ESTATICO-OFERTA |

> Ângulo e hook **não entram no nome** — eles continuam existindo no nome do arquivo do criativo se um dia você quiser cruzar. O tráfego trabalha por funil/oferta/formato.

---

## 2. Dicionário de códigos

### FUNIL
`DIRETO` · `PWA`

### LANCE (só na campanha)
`LIVRE` (Highest Volume) · `COSTCAP` · `BIDCAP`

### EVENTO (só na campanha)
`REG` (cadastro/Lead) · `DEP` (depósito/Purchase) · `INST` (instalação, só PWA)

### PUBLICO / OS / COLOCAÇÃO (só no conjunto)
`HM-18-45` (gênero+faixa) · `AND` `IOS` `ALL` · `AUTO` `MAN-REELS` `MAN-FEED`

### OFERTA (aquisição — Banco Mestre)
| Código | Oferta |
|---|---|
| `BONUS###` | Bônus boas-vindas match (nº = %, ex. BONUS100) |
| `PACK` | Pacote escalonado |
| `NODEP` | Bônus sem depósito (dinheiro) |
| `GIROSND` | Giros grátis sem depósito |
| `GIROSCD` | Giros grátis com depósito |
| `FREEBET` | Aposta grátis |
| `BETGET` | Bet & Get |
| `RISKFREE` | Primeira aposta sem risco |
| `SUPEROD` | Super odd de entrada |
| `COMBO` | Combo casino + sports |
| `PROMOCODE` | Código promocional exclusivo |
| `PIXBONUS` | Bônus por método (PIX/cripto) |
| `SORTEO` | Sorteio de cadastro |
| `HIGHROLLER` | Pacote high roller |
| `DEMO` | Demo com prêmio real |

### FORMATO (Banco Mestre)
| Código | Formato | Cat. |
|---|---|---|
| `ESTATICO-OFERTA` | Banner de oferta direta | D |
| `ESTATICO-PRINT` | Print de comprovante | D |
| `ESTATICO-NOTA` | Nota de celular | D |
| `CARROSSEL` | Carrossel sequencial | D/F |
| `MEME` | Meme nativo | F |
| `UGC-SELFIE` | Selfie-reação | A |
| `UGC-DEPO` | Depoimento sentado | A |
| `UGC-POV` | POV mão na mesa | A |
| `TELA-SLOT` | Screen recording de slot | B |
| `TELA-PIX` | Notificação de PIX em close | B |
| `TELA-TUTO` | Tutorial 3 passos | B |
| `IA-AVATAR` | UGC com avatar de IA | E |
> Lista completa nas abas do `Banco-Mestre-Criativos.xlsx`. Na dúvida, use o código que já está no nome do arquivo do criativo.

---

## 3. Como nomear — passo a passo (à prova de erro)
1. **Abra o nome do criativo** que o Eugene entregou → já tem OFERTA e FORMATO.
2. **Campanha:** GEO + FUNIL + OFERTA + LANCE + EVENTO + DDMM.
3. **Conjunto:** PUBLICO + OS + COLOCACAO.
4. **Anúncio:** número (`01`, `02`…) + FUNIL + OFERTA + FORMATO.
5. **Confira:** todo token existe no dicionário. Fora da lista → padroniza ou avisa o Gerente.

---

## 4. Exemplo completo (campanha de bônus 100%)
Criativos recebidos: 5 estáticos de oferta da campanha de bônus 100%.
```
CAMPANHA:  CL_DIRETO_BONUS100_LIVRE_REG_1506
 └ CONJUNTO:  HM-18-45_AND_AUTO
     ├ 01_DIRETO_BONUS100_ESTATICO-OFERTA
     ├ 02_DIRETO_BONUS100_ESTATICO-OFERTA
     ├ 03_DIRETO_BONUS100_ESTATICO-OFERTA
     ├ 04_DIRETO_BONUS100_ESTATICO-PRINT
     └ 05_DIRETO_BONUS100_ESTATICO-NOTA
```

---

## 5. O que o Analista lê (com esses 4 campos)
Agrupa as métricas e te diz o que cortar/escalar:
- **Por OFERTA:** BONUS100 CPA $8 vs NODEP $19 → escala BONUS100.
- **Por FORMATO:** ESTATICO-OFERTA bate ESTATICO-PRINT no FTD → pede mais oferta direta.
- **Por FUNIL:** Direto CPA $8 vs PWA $27 → realoca pro Direto.
- **Por ANÚNCIO (número):** anúncio 02 com CPA $6, anúncio 04 com $22 → mata o 04, escala o 02.

Diagnóstico rápido por métrica:
| Sintoma | Problema é de |
|---|---|
| CTR bom + FTD ruim | OFERTA ou LANDER |
| CTR baixo | FORMATO/criativo |
| CPA acima do teto do GEO | LANCE / público |
