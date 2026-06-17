# Prompt para o Codex — Adicionar 3 agentes (Criação de Anúncios) ao Paperclip

> Cole no Codex (com terminal + acesso ao repositório e ao Paperclip rodando).

---

Você é engenheiro sênior trabalhando no Paperclip já rodando nesta máquina (company **Alcateia**, runtime `claude_local`). **Não construa estrutura paralela**: o Paperclip já fornece UI (cards, páginas, menus), persistência, histórico, loading/erro e o fluxo via tickets/delegação. A tarefa é **contratar 3 agentes por configuração** (não codar componentes) e ligar o fluxo.

## Contexto e padrão
- Siga a skill `skills/paperclip-create-agent/SKILL.md` (workflow de hire via API: `/api/agents/me`, `/llms/agent-configuration*.txt`, `/api/companies/$COMPANY_ID/agent-configurations`, `/llms/agent-icons.txt`, e o POST de hire descrito em `references/api-reference.md`).
- Espelhe os agentes existentes (Gerente de Trafego, Analista, Trafegador Direto/PWA): mesmo **adapter `claude_local`**, **reportsTo = Gerente de Trafego**, mesma convenção de nome/ícone.
- Use o `ANTHROPIC_API_KEY` já no `.env`. Não exponha a chave.

## Agentes a contratar (instruções já escritas)
Use como **instructions/prompt base** os arquivos:
- `C:\Users\gabri\Downloads\paperclip-master\alcateia-agentes\agentes\05-analista-anuncios-meta.md`
- `...\alcateia-agentes\agentes\06-copywriter.md`
- `...\alcateia-agentes\agentes\07-editor.md`

1. **Analista de Anúncios Ativos na Meta** — desc.: "Pesquisa anúncios ativos na Biblioteca da Meta e identifica padrões de escala por nicho." Ícone de pesquisa/gráfico.
2. **Copywriter** — desc.: "Cria copies de performance e descrições visuais detalhadas a partir das referências encontradas." Ícone de caneta/texto.
3. **Editor** — desc.: "Transforma a copy e o briefing visual em criativos ou especificações prontas para produção." Ícone de imagem/camadas.

Agrupe os três sob a categoria/label **"Criação de Anúncios"** (use o mecanismo de agrupamento/labels que o Paperclip já tiver; se não houver, apenas mantenha o reportsTo e o naming consistente).

## Ferramenta de pesquisa do Analista (Meta Ad Library)
Não crie scraping. A busca pública já existe como ferramenta `ads_library_search` (conector Meta Ads). Faça uma das opções, na ordem:
1. Se o runtime `claude_local` (Claude Code) puder receber um MCP, configure o **MCP de Meta Ads** para o Analista usar `ads_library_search` (apenas dados públicos).
2. Se não der agora, deixe o Analista operar com **links/prints da Biblioteca fornecidos pelo usuário** (o prompt dele já cobre esse fallback) e deixe a arquitetura pronta para plugar o MCP depois.

## Fluxo "Criação de Criativos" (delegação)
Configure o fluxo Analista → Copywriter → Editor usando o modelo de **tickets/delegação** do Paperclip:
- Saída do Analista vira input do Copywriter; saída do Copywriter vira input do Editor.
- Cada agente também deve poder ser executado **isoladamente** (já é o comportamento padrão dos agentes do Paperclip).
- Se fizer sentido, crie um Project "Criação de Criativos" para abrigar essas tasks.

## Compliance (embutir nos prompts — já está nos .md)
Originalidade (não copiar criativos/marcas/logos/rostos de terceiros); iGaming/Aviator só +18, sem promessa de lucro garantido; nichos sensíveis sem alegações enganosas.

## Critérios de aceite
- Os 3 agentes aparecem no Paperclip (org chart + lista), cada um executável sozinho.
- Fluxo Analista→Copywriter→Editor funciona (enviar saída de um como input do próximo).
- Não quebrou os 4 agentes existentes nem rotas/funcionalidades.
- Sem dependências novas pesadas (não introduzir Supabase/Prisma/Firebase). Tipagem e organização mantidas.

## Testes (rode e reporte)
1. Analista: "Buscar criativos de Aviator que estão escalando no Brasil" → retorna padrões, referências, sinais de escala, recomendações.
2. Enviar análise ao Copywriter → copies + headlines + CTAs + descrição visual em TXT.
3. Enviar saída ao Editor → especificação visual em camadas (ou criativo, se houver geração de imagem).
4. Copywriter sozinho (sem Analista) com dados manuais.
5. Editor sozinho com copy/briefing manual.

## Documentação
Atualize/crie um arquivo de notas curto (`alcateia-agentes\relatorios\NOTAS-3-AGENTES.md`) com: o que foi criado, onde (IDs/config), como o fluxo foi ligado e como testar. Ao terminar, me diga os nomes/IDs dos agentes criados e como abro o fluxo no painel.
