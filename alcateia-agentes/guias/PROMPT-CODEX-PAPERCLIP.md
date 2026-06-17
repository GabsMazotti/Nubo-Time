# Prompt para o Codex — Subir o Paperclip e configurar a Alcateia

> Copie tudo abaixo da linha e cole no Codex (CLI/IDE) com acesso ao terminal e à pasta do projeto.

---

Você é um agente de engenharia com acesso ao terminal e ao sistema de arquivos desta máquina (Windows). Sua tarefa tem DUAS fases: (1) subir o servidor do Paperclip localmente e (2) deixar a estrutura da "Alcateia" pronta para uso. Trabalhe de forma autônoma, verifique cada passo e só me peça ajuda se precisar de uma credencial ou de uma decisão que você não pode tomar sozinho.

## Contexto
- O código-fonte do Paperclip já está clonado nesta máquina, porém **aninhado**. O diretório real do projeto (com `package.json`, `pnpm-workspace.yaml`) está em:
  `C:\Users\gabri\Downloads\paperclip-master\paperclip-master`
- Paperclip é um app Node.js + React que orquestra um time de agentes de IA. Ele sobe um Postgres embutido automaticamente. Requisitos: **Node.js 20+** e **pnpm 9.15+**.
- Documentação: https://docs.paperclip.ing — README do projeto na raiz do repositório.

## FASE 1 — Subir o servidor (objetivo: painel acessível em http://localhost:3100)
1. Verifique a versão do Node: `node -v`. Se for menor que 20, **pare e me avise** (preciso instalar/atualizar o Node) — não tente instalar Node sem confirmar comigo.
2. Habilite o pnpm na versão certa:
   ```
   corepack enable
   corepack prepare pnpm@9.15.4 --activate
   ```
   Confirme com `pnpm -v` (precisa ser 9.15+).
3. Entre no diretório interno do projeto:
   ```
   cd C:\Users\gabri\Downloads\paperclip-master\paperclip-master
   ```
4. Instale as dependências:
   ```
   pnpm install
   ```
   - Se falhar com `E404` para `paperclipai` por causa de registry privado no `.npmrc`, rode com o registry público: `npm config get registry` para diagnosticar e use `--registry https://registry.npmjs.org` quando aplicável.
5. Suba o servidor em modo dev:
   ```
   pnpm dev
   ```
6. Aguarde subir e **verifique** que o painel responde em `http://localhost:3100` (ex.: `curl http://localhost:3100` ou abrir no navegador). Se a porta 3100 estiver ocupada, crie um arquivo `.env` a partir de `.env.example` e ajuste `PORT`, depois suba de novo.
7. Reporte: versão de Node/pnpm, se o `pnpm install` e o `pnpm dev` concluíram, e a URL/porta final do painel.

> Importante: deixe o `pnpm dev` rodando (o servidor precisa ficar de pé). Não faça `git push` nem altere o código do Paperclip.

## FASE 2 — Configurar a "Alcateia" no Paperclip
Depois que o painel estiver no ar, configure a empresa/time abaixo. Use a UI em `http://localhost:3100` e/ou a API/SKILL.md do Paperclip (consulte a doc do repositório para o formato exato de configuração de company, agents, goals, budgets e heartbeats). Preciso da minha **chave de API do Claude/Anthropic** para os agentes rodarem — me peça quando chegar nesse ponto (não invente nem use chave de outro lugar).

**Mission (empresa):**
"Escalar um casino online no Chile (LATAM hispano) via tráfego pago no Meta, com CPA por FTD na banda US$5–30 (alvo US$10) E qualidade de jogador (2º depósito ≥ 25%, payback ≤ 30 dias). Idioma de trabalho PT-BR; copy de anúncio em ES."

**Organograma (4 agentes, runtime = Claude/Anthropic):**
1. **Gerente de Tráfego** (líder; único que fala com o dono) — define estratégia, divide orçamento entre funis Direto/PWA, fixa metas/KPIs, emite "ficha de campanha", lê o relatório do Analista e dá ordens de ajuste. Não cria copy nem monta anúncio (delega).
2. **Trafegador Direto** (reporta ao Gerente) — monta/nomeia/sobe e mede o funil direto (cadastro→FTD). Recebe criativos prontos; não cria copy.
3. **Trafegador PWA** (reporta ao Gerente) — idem, no funil PWA (instala→cadastro→FTD).
4. **Analista** (reporta ao Gerente) — lê métricas, compara com metas e devolve veredito por item (ESCALAR/MANTER/REFRESH/PAUSAR-MATAR/ESPERAR) com ação numérica.

**Descrições de cargo (job descriptions):** use o conteúdo dos arquivos `.md` em `C:\Users\gabri\Downloads\paperclip-master\alcateia-agentes\agentes\` (01-gerente-de-trafego.md, 02-trafegador-direto.md, 03-trafegador-pwa.md, 04-analista.md). As "leis" em `...\alcateia-agentes\leis\` (00-SISTEMA.md, NOMENCLATURA.md, DECISOES.md, ALFA-playbook.md) devem entrar como contexto compartilhado / SKILL.md para todos os agentes. Os contratos de dados (JSON Schema) estão em `...\alcateia-agentes\contratos\`.

**Budgets sugeridos (mensais, ajuste comigo):** Gerente US$60 · Analista US$40 · Trafegador Direto US$40 · Trafegador PWA US$40.

**Heartbeats sugeridos:** Analista 1×/dia; Gerente a cada 48–72h (ciclo de otimização); Trafegadores acordam por atribuição de ticket.

**Governança:** mantenha tudo exigindo aprovação do dono (board) para ações sensíveis; nenhum agente contrata outro sem aprovação.

## Critério de pronto
- `http://localhost:3100` acessível com o servidor rodando.
- Empresa "Alcateia" criada com a mission, os 4 agentes no organograma com suas descrições, budgets e heartbeats configurados.
- Um resumo final do que foi feito, a URL do painel, e o que ficou pendente (ex.: chave de API, ativação de algum agente).
