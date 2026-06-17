# Deploy do Paperclip no servidor → app.nubomind.com

Servidor: DigitalOcean Droplet `143.198.117.42` (Ubuntu 24.04, 4 GB).
Domínio: **app.nubomind.com** (registro A já criado no Hostinger → 143.198.117.42).

> Esta é a parte que roda **dentro do servidor** (terminal). Eu não tenho SSH para executar daqui — você roda no **Web Console** da DigitalOcean (botão "Web Console" na página do Droplet) ou via SSH:
> `ssh -i CAMINHO_DA_SUA_CHAVE root@143.198.117.42`

---

## Passo 1 — Abrir o terminal do servidor
Na página do Droplet (DigitalOcean) → botão **Web Console** (abre um terminal no navegador, já logado como root). Ou SSH com a sua chave.

## Passo 2 — Colar o script abaixo
Antes de colar, **troque** `COLE_SUA_CHAVE` pela sua `ANTHROPIC_API_KEY` (a mesma do `.env` local). Depois cole o bloco inteiro e dê Enter.

```bash
#!/usr/bin/env bash
set -euo pipefail

DOMAIN="app.nubomind.com"
export ANTHROPIC_API_KEY="COLE_SUA_CHAVE"

# 1) Swap de 2GB (evita travar build/agents num droplet de 4GB)
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# 2) Pacotes base
apt-get update && apt-get -y upgrade
apt-get install -y curl git ufw debian-keyring debian-archive-keyring apt-transport-https

# 3) Node 22 + pnpm
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
corepack enable && corepack prepare pnpm@9.15.4 --activate

# 4) Claude Code CLI (runtime claude_local) — usa a ANTHROPIC_API_KEY
npm install -g @anthropic-ai/claude-code

# 5) Firewall
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable

# 6) Caddy (HTTPS automático via Let's Encrypt)
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt-get update && apt-get install -y caddy
cat > /etc/caddy/Caddyfile <<EOF
${DOMAIN} {
  reverse_proxy localhost:3100
}
EOF
systemctl reload caddy

echo "== Base pronta. Agora suba o Paperclip (passo 3 do guia). =="
```

## Passo 3 — Subir o Paperclip
Ainda no terminal do servidor:

```bash
export ANTHROPIC_API_KEY="COLE_SUA_CHAVE"
npx --yes paperclipai onboard --yes --bind lan
```
- O `onboard` instala o Paperclip + Postgres embutido e sobe o painel (porta padrão **3100**).
- `--bind lan` ativa o modo **autenticado** (com login) — importante porque vai ficar exposto via domínio.
- Anote o **link/token de primeiro acesso** que ele imprimir.

> Para manter o Paperclip rodando 24/7 (mesmo após fechar o terminal), rode-o sob um gerenciador de processo. Se o `onboard` não criar um serviço automático, use:
> ```bash
> npm install -g pm2
> pm2 start "npx paperclipai serve" --name paperclip
> pm2 save && pm2 startup
> ```

## Passo 4 — Testar
Abra **https://app.nubomind.com** — o Caddy emite o certificado HTTPS automaticamente (precisa do DNS já apontando, o que já fizemos). Faça login no Paperclip.

## Passo 5 — Migrar a Alcateia (agentes) para o servidor
A company "Alcateia" + os agentes que criamos estão no **banco local** (seu PC), não no servidor. Para levá-los:
1. No Paperclip **local** (localhost:3100) → tela **Org** → botão **Export company** (baixa um arquivo).
2. No Paperclip **do servidor** (app.nubomind.com) → **Org** → **Import company** → suba esse arquivo.
Isso recria o organograma (Gerente Geral, Trafegadores, Analista, Analista de Anúncios, Copywriter, Editor) no servidor.

---

## Avisos honestos
- **Não testei no servidor** (não tenho SSH daqui), então pode precisar de pequenos ajustes — em especial os flags exatos do `paperclipai onboard`/`serve` e como ele expõe a porta. Rode passo a passo e, **se algo der erro, me cole a mensagem** que eu corrijo na hora.
- O nome do pacote do Claude Code (`@anthropic-ai/claude-code`) e a porta (3100) devem ser confirmados na primeira execução.
- Sua **ANTHROPIC_API_KEY** entra como variável de ambiente no servidor — não a compartilhe.
- A propagação do DNS (app.nubomind.com) pode levar de minutos até algumas horas; se o Caddy reclamar do certificado, espere o DNS propagar e rode `systemctl reload caddy`.
