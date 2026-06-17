# CLAUDE.md — Projeto Alcateia (memória para o Claude Code)

> Este arquivo é lido automaticamente pelo Claude Code ao abrir esta pasta. Ele carrega o contexto do projeto para continuar de onde o trabalho no Cowork parou. Mantenha-o atualizado.

## O que é o projeto
**Alcateia** — operação de **tráfego pago para iGaming (casino)** no Meta, operada pelo **dono** (anunciante direto). Foco **LATAM hispano (Chile)**. Meta: **CPA ~US$10/FTD** (banda US$5–30), com qualidade de jogador (2º depósito, NGR, payback). Trabalho em **PT-BR**; copy de anúncio em **espanhol**.

A operação roda como um sistema de **7 agentes** no **Paperclip** (orquestrador), hospedado 24/7 num servidor próprio.

## Infra (fonte da verdade)
- **Painel Paperclip:** https://app.nubomind.com (empresa **Alcateia**, prefixo de tarefas **ALC**).
- **Servidor:** DigitalOcean droplet `143.198.117.42`, Ubuntu. Domínio app.nubomind.com via Caddy (HTTPS automático).
- **Serviço:** Paperclip roda como serviço systemd `paperclip` (usuário `paperclip`), 24/7, reinicia sozinho. Comandos: `systemctl status|restart paperclip`, logs `journalctl -u paperclip -f`.
- **Chave de API:** `ANTHROPIC_API_KEY` fica em `/etc/paperclip.env` no servidor. Os agentes (claude_local = Claude Code) herdam essa chave do ambiente — billing por consumo, sem assinatura por pessoa.
- **DNS:** Hostinger (domínio nubomind.com), registro A `app` → 143.198.117.42.

## Os 7 agentes (organograma)
- **Gerente Geral** (topo, orquestrador, único que fala com o dono; tem skills de gestão do Paperclip).
  - **Trafegador Direto** — campanhas funil direto (casino).
  - **Trafegador PWA** — campanhas funil PWA.
  - **Analista** — auditoria/relatórios de ciclo, veredito de escala.
  - **Analista de Anúncios Ativos na Meta** — pesquisa criativos na Biblioteca de Anúncios.
  - **Copywriter** — copies + descrição visual (entrega ao Editor).
  - **Editor** — criativo/especificação visual a partir da copy.
- **Fluxo de criativos:** Analista de Anúncios → Copywriter → Editor.

## Regras/leis dos agentes
- **Lances:** Lances livres → Cost cap → Bid cap (nessa ordem).
- **Aprendizado:** ajustar orçamento/lance no máx **+20% por passo**.
- **Escala:** veredito ESCALAR do Analista + ≥25 conversões + CPA na banda.
- **Compliance iGaming:** +18; sem promessa de lucro garantido; não copiar criativos/marcas/logos/rostos de terceiros; sem scraping de mídia da Biblioteca do Meta (só dados públicos/links).

## Estrutura de arquivos (nesta pasta)
- `alcateia-agentes/agentes/` — instruções de cada agente (01..07).
- `alcateia-agentes/leis/` — 00-SISTEMA, NOMENCLATURA, DECISOES, ALFA-playbook.
- `alcateia-agentes/contratos/` — schemas JSON (ficha de campanha, relatório de status, relatório de análise).
- `alcateia-agentes/guias/` — guias de deploy e integração.
- `LEIA-PRIMEIRO-MAPA-DO-PROJETO.md` — mapa geral.
- `HANDOFF-PARA-O-CLAUDE-DA-EQUIPE.md` — onboarding do colega.
- `paperclip-master/` — código-fonte do Paperclip (referência; o que roda em produção é via `npx paperclipai` no servidor).

## Como continuar o desenvolvimento (no Claude Code)
- **Editar a estrutura dos agentes:** alterar os `.md` em `alcateia-agentes/` e/ou aplicar via painel (export/import) ou pela API do Paperclip.
- **Criar/alterar agentes no servidor:** via API autenticada do Paperclip (`/api/companies/<id>/agent-hires`, `PATCH /api/agents/:id`) ou pedindo ao Gerente Geral no painel.
- **Mexer no servidor:** via SSH/Web Console do droplet. Editar `/etc/paperclip.env` e `systemctl restart paperclip` aplica mudanças de chave/config.
- **IDs úteis:** empresa Alcateia (servidor) = `35744ed6-fe06-4044-9529-0d1f36c789be`; prefixo ALC.

## Conectores (se precisar deles no Claude Code)
No Cowork havia conectores de **Meta Ads** e **Google Drive** e automação de navegador. No Claude Code, adicione-os como **MCP servers** quando necessário: `claude mcp add` (ou um arquivo `.mcp.json` na raiz do projeto). Sem isso, o Claude Code já edita arquivos, roda comandos e mexe no servidor normalmente.

## Pendências conhecidas
- Rotacionar a `ANTHROPIC_API_KEY` (apareceu em texto em conversa anterior).
- Empresa vazia "Nubomind" sobrou do onboarding no servidor (pode ser removida).
- Skill "alcateia-leis" referencia o ID da empresa local antiga (as leis já estão dentro de cada AGENTS.md).
