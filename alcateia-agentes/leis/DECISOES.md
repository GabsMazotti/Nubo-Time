# MOTOR DE DECISÃO — Escalar · Manter · Pausar (Meta)

Regras consolidadas do que **de fato funciona** (Meta + fóruns + agências), traduzidas para o seu caso: evento = FTD, CPA alvo ~US$10, banda US$5–30. O Analista e o Gerente decidem por estas tabelas — sem achismo.

> Lei do aprendizado (vale pra tudo): mudança de budget acima de **~20–30% de uma vez reseta o aprendizado** e sobe o CPA 25–40%. Toda decisão respeita isso.

---

## 0. Antes de decidir — guardrails estatísticos
- **Campanha/conjunto novo:** não julgar antes de **3–5 dias** OU **50 eventos**. Use CTR como sinal precoce, não o CPA.
- **Veredito de conjunto/anúncio:** só definitivo com **≥25 conversões** do evento. Abaixo disso = "aguardar volume" ou usar Cadastro como proxy.
- **Confiança pra matar:** depois de gastar **3× o CPA alvo sem 1 FTD**, só há ~5% de chance de ser um bom anúncio. Aí mata sem dó. Abaixo de **2× CPA** ainda é variância — espera.

---

## 1. 🟢 ESCALAR
**Quando (todos):** CPA ≤ alvo por **3–4 dias estável** · ≥25 conv (ideal 50) · frequência < 2,5 · qualidade na meta (%2º dep/payback). Sinal verde do Analista.

**Vertical (subir budget no vencedor) — primeira escolha:**
- **+20% a cada 48–72h.** Nunca passar de 20–30% de uma vez.
- Mais seguro pra preservar performance. Use até saturar.

**Cost cap ao escalar:**
- Largada da escala: cap **15–25% acima** do alvo (ex. alvo $10 → cap $11,5–12,5) pra dar volume.
- Buscando eficiência: cap **10–20% abaixo** do alvo (ex. $8–9).
- Ajuste o cap em passos de **5–15%** até achar o "preço de equilíbrio".

**Horizontal (duplicar) — quando o vertical satura:**
- Sinais de saturação: **CPM +60%**, **frequência > 4**, impressões estagnadas mesmo subindo budget.
- Duplicar o vencedor (**Post-ID**, preserva prova social) para nova **CBO**, com **+50% de budget** pra bancar o novo aprendizado. Espera **7–14 dias** re-estabilizar.
- Duplicar **com intenção** (novo público/colocação/criativo), não só pra gastar mais.
- **Furar aprendizado travado:** duplicar com budget um pouco maior; quando o clone estabiliza, pausa o original.

---

## 2. 🟡 MANTER
**Quando:** dentro da meta, mas **sem folga pra escalar** (frequência subindo, volume limitado, CPA no limite).

**Como segurar o CPA estável:**
- **Frequência < 2,5–3,0.** Acima disso o CPA sobe.
- **Criativo fresco:** alto gasto → girar a cada **7–10 dias**; baixo gasto → **2–4 semanas**.
- **Público amplo** (dá sinal pro algoritmo) e **não mexer durante o aprendizado**.

**Gatilho de refresh de criativo (fadiga):**
- CPA **> 140% da base por 48h+**, **OU** os três juntos: CPA +40% · CTR −50% do lançamento · frequência > 2,5.
- Ação: **pedir novos criativos ao time de copy (Eugene)** — fadiga se resolve com criativo, não trocando público. O tráfego solicita, não cria.

---

## 3. 🔴 PAUSAR / MATAR
**Anúncio ou conjunto:**
- Gastou **3× o CPA alvo sem nenhum FTD** (ex. alvo $10 → matou em **$30** sem depósito).
- **Frequência > 3–4 + CTR caiu > 20%** do pico → fadiga: refresca ou mata.
- **CPA acima do teto do geo por 7 dias** → mata (regra do Banco Mestre).
- **Thumbstop / CPM / CTR fora da curva da conta em 72h** → mata cedo.

**Não matar:**
- No meio do aprendizado (antes de 50 conv / 3–5 dias), salvo catástrofe (0 resultado a 3× CPA).
- Por um dia ruim isolado — olhe a janela de 3 dias.

---

## 4. TABELA-MESTRE (decisão rápida)
| Situação medida | Decisão | Ação numérica |
|---|---|---|
| CPA ≤ alvo, estável 3–4d, freq < 2,5 | 🟢 ESCALAR vertical | +20% budget / 48–72h |
| Vencedor saturando (CPM +60%, freq > 4) | 🟢 ESCALAR horizontal | duplica Post-ID → CBO +50%, cost cap alvo+20% |
| Dentro da meta, sem folga | 🟡 MANTER | freq < 2,5; refresh criativo no prazo |
| CPA +40% & CTR −50% & freq > 2,5 | 🟡 REFRESH | pedir novos criativos (Eugene) |
| Gastou 3× CPA alvo sem FTD | 🔴 PAUSAR-MATAR | pausar/excluir item |
| Freq > 3–4 & CTR −20% do pico | 🔴 REFRESH/MATAR | trocar criativo ou cortar |
| CPA > teto do geo por 7d | 🔴 PAUSAR-MATAR | cortar e realocar budget |
| < 2× CPA gasto, < 25 conv | ⏳ ESPERAR | não tocar (variância) |

---

## 5. Como o agente usa isto
- O **Analista** mede cada item, bate nesta tabela e emite o veredito (ESCALAR/MANTER/REFRESH/PAUSAR-MATAR/ESPERAR) com a ação numérica.
- O **Gerente** executa: aplica a % de budget, manda duplicar/pausar, e quando o veredito é REFRESH, **pede criativo novo ao Eugene** (o tráfego nunca cria copy).
- Tudo lido pela `NOMENCLATURA.md` (por funil/oferta/formato/anúncio).
