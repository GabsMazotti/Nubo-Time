# Começar no Claude Code (projeto Alcateia)

O projeto foi migrado do Cowork para o **Claude Code** (CLI). Tudo que importa do contexto está no `CLAUDE.md` (lido automaticamente). Billing é **por consumo da sua chave de API** — sem plano/assinatura por pessoa.

## 1. Instalar (uma vez)
Precisa de Node 18+.
```bash
npm install -g @anthropic-ai/claude-code
```

## 2. Definir a chave de API (billing por consumo)
**Windows (PowerShell/Prompt):**
```bash
setx ANTHROPIC_API_KEY "SUA_CHAVE_AQUI"
```
(feche e reabra o terminal depois do `setx`)

**Servidor / Linux:**
```bash
export ANTHROPIC_API_KEY=$(grep ANTHROPIC_API_KEY /etc/paperclip.env | cut -d= -f2)
```

## 3. Abrir o projeto
```bash
cd C:\Users\gabri\Downloads\paperclip-master
claude
```
Ao iniciar dentro desta pasta, o Claude Code lê o `CLAUDE.md` e já entende a operação Alcateia (servidor, 7 agentes, regras, IDs).

## 4. Onde fica o quê
- **Estrutura/agentes/leis do projeto:** `alcateia-agentes/`
- **Operação ao vivo (agentes rodando 24/7):** painel https://app.nubomind.com (empresa ALC)
- **Servidor:** droplet DigitalOcean `143.198.117.42`; serviço `paperclip` (systemd)

## 5. Reconectar ferramentas externas (quando precisar)
Os conectores que existiam no Cowork (Meta Ads, Google Drive, navegador) **não vêm automaticamente**. No Claude Code, adicione como MCP só quando for usar:
```bash
claude mcp add            # assistente interativo para adicionar um MCP server
claude mcp list           # ver o que está conectado
```
Para editar arquivos, rodar comandos e administrar o servidor/Paperclip, o Claude Code **já funciona sem nenhum MCP**.

## 6. Comandos úteis dentro do Claude Code
- `/init` — gera/atualiza o `CLAUDE.md` a partir do código.
- `/mcp` — gerencia conectores MCP.
- `/help` — lista de comandos.

## Segurança
- O `.env` com a chave **não é versionado** (protegido pelo `.gitignore`).
- Rotacione a `ANTHROPIC_API_KEY` periodicamente (ela já circulou em texto): gere nova em platform.claude.com, troque em `/etc/paperclip.env` no servidor e rode `systemctl restart paperclip`.
