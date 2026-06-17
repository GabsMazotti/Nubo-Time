# MAPA DO PROJETO — Alcateia + Paperclip

Documento único que diz **onde está cada coisa**. Comece por aqui.

Pasta raiz do projeto (conectada): `C:\Users\gabri\Downloads\paperclip-master\`

---

## 1. Estrutura local (nesta máquina)

```
paperclip-master\                         ← pasta raiz conectada
├─ LEIA-PRIMEIRO-MAPA-DO-PROJETO.md        ← este arquivo
│
├─ alcateia-agentes\                       ← TUDO da Alcateia em um lugar
│   ├─ agentes\                            (os 4 papéis / job descriptions)
│   │   ├─ 01-gerente-de-trafego.md
│   │   ├─ 02-trafegador-direto.md
│   │   ├─ 03-trafegador-pwa.md
│   │   └─ 04-analista.md
│   ├─ leis\                               (regras compartilhadas / contexto)
│   │   ├─ 00-SISTEMA.md
│   │   ├─ NOMENCLATURA.md
│   │   ├─ DECISOES.md
│   │   └─ ALFA-playbook.md
│   ├─ contratos\                          (JSON Schema dos handoffs)
│   │   ├─ ficha-de-campanha.schema.json
│   │   ├─ relatorio-de-status.schema.json
│   │   └─ relatorio-de-analise.schema.json
│   ├─ guias\
│   │   ├─ BRIEFING-GERENTE.md             (como pedir campanha ao Gerente)
│   │   ├─ INTEGRACAO-PUBLICAR.md          (como publicar no Meta)
│   │   └─ PROMPT-CODEX-PAPERCLIP.md       (prompt p/ o Codex)
│   └─ relatorios\
│       ├─ README-ENTREGA.md               (índice do pacote de agentes)
│       └─ RELATORIO.md                    (o que foi feito)
│
└─ paperclip-master\                       ← CÓDIGO do Paperclip (NÃO mover; é o que roda)
    ├─ .env                                (suas variáveis; ANTHROPIC_API_KEY vai aqui)
    ├─ package.json, ui\, server\, ...
    └─ (servidor sobe em http://localhost:3100 com `pnpm dev`)
```

> Por que o Paperclip fica separado: ele é a aplicação que roda o servidor. Mover a pasta quebra o `pnpm dev`. Por isso os arquivos da Alcateia ficam ao lado, em `alcateia-agentes\`, e o Paperclip lê de lá quando configurado.

---

## 2. O que está FORA desta máquina (externo)

| Item | Onde está | Observação |
|---|---|---|
| **Criativos do Aviator** (feed + stories) | Google Drive, pasta **"Aviator"** + já enviados na conta de anúncios do Meta | Drive: https://drive.google.com/drive/folders/1F8TxxnknfcFGJIGXqi967qAKRqOSctVu |
| **Campanha no Meta** | Conta de anúncios **NKMqHbzE** (`491946870440587`, USD) | Ver §3 |
| **Logs do Codex** | `C:\Users\gabri\Documents\PC\paperclip-dev.out.log` e `...err.log` | Fora da pasta do projeto |
| **Chave da API Anthropic** | Você gera em platform.claude.com/settings/keys e cola no `.env` | Nunca compartilhar |

> Se quiser, eu posso **baixar os criativos do Drive para uma pasta local** `alcateia-agentes\criativos\` para deixar cópia junto do projeto. É só pedir.

---

## 3. Campanha de teste já criada no Meta (PAUSADA)

- **Conta:** NKMqHbzE — `491946870440587` (USD) · **Página:** Denner Gomes (`895857066941923`) · **Pixel:** ALCATEIA Respondi (`2382448832150394`)
- **Campanha:** `MENTORIA - [TESTE_CRIATIVO] | AVIATOR | 16/06` — ID `120249390689650732` (Vendas, ABO)
- **Estrutura 1-5-2** (5 conjuntos, 2 anúncios cada — feed 1:1 + stories 9:16), US$5/dia por conjunto, Chile · Homens 24-45 · interesse Gambling:
  - `Gambling | 24-45 | Homens | 01` → `120249390935510732`
  - `... | 02` → `120249390936560732`
  - `... | 03` → `120249390937990732`
  - `... | 04` → `120249390938990732`
  - `... | 05` → `120249390940520732`
- Conjuntos antigos (flexível e tentativa 1-10-1) foram **arquivados** (não rodam).
- **Status:** tudo PAUSADO — ativar manualmente no Gerenciador (exige autorização de jogo da Meta para o Chile).

---

## 4. Estado do Paperclip
- Servidor rodando via `pnpm dev` em `http://127.0.0.1:3100` (Node 24, pnpm 9.15.4).
- Pendências para os agentes rodarem: `ANTHROPIC_API_KEY` no `.env` (ou no painel) + runtime (Claude Code CLI ou adapter de API).
- Próximo passo: o Codex configura a company "Alcateia" usando os arquivos de `alcateia-agentes\` (ver `guias\PROMPT-CODEX-PAPERCLIP.md`).
