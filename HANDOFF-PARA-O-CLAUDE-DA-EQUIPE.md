# Handoff — continuar a operação Alcateia pelo Claude (membro da equipe)

> Guia para um membro da equipe continuar editando a estrutura da Alcateia de qualquer computador. **Não é preciso comprar plano do Claude:** a IA já roda dentro do servidor (os agentes), paga pela chave de API que o dono já configurou.

---

## 1. O que é isto
A **Alcateia** é uma operação de **tráfego pago para iGaming (casino)** no Meta, operada pelo **dono** (anunciante direto), foco **LATAM hispano (Chile)**, com meta de **CPA ~US$10 por FTD** (banda US$5–30) e qualidade de jogador (2º depósito, NGR, payback).

A operação é gerida por um sistema de **7 agentes** rodando no **Paperclip** (orquestrador de agentes), hospedado **24/7 num servidor próprio**. A estrutura (agentes, instruções, organograma, histórico) **não fica em nenhum computador** — fica no servidor. Qualquer pessoa autorizada acessa pelo navegador e edita ao vivo.

## 2. Onde tudo vive (fonte da verdade)
- **Painel da operação:** https://app.nubomind.com  (Paperclip, com login)
- **Empresa:** Alcateia (prefixo de tarefas **ALC**)
- **Servidor:** DigitalOcean, domínio app.nubomind.com, HTTPS automático (Caddy), serviço 24/7 (systemd; reinicia sozinho).
- **Runtime dos agentes:** cada agente roda como "Claude Code" no servidor, usando a chave da Anthropic que está no ambiente do servidor (`/etc/paperclip.env`). Não é preciso vincular chave por agente.

> **Tudo é feito NO PAINEL** (app.nubomind.com), num navegador comum. **Você NÃO precisa de plano/assinatura do Claude.** A IA já está dentro do painel: os agentes são "Claude" rodando no servidor, pagos pela chave de API compartilhada que o dono já configurou.

## 3. Como entrar (sem precisar de plano do Claude)
1. Abra **https://app.nubomind.com** num navegador comum (qualquer computador).
2. Entre com o login que você cria pelo **link de convite** que o dono te enviou (acesso de **administrador** da Alcateia). Login próprio — não use a conta do dono.
3. Pronto. Você está na mesma Alcateia que todo mundo, ao vivo. Não precisa instalar nada, nem extensão, nem app do Claude.

## 4. Os 7 agentes (organograma)
- **Gerente Geral** — orquestrador, único que fala com o dono. (topo)
  - **Trafegador Direto** — campanhas do funil direto (casino).
  - **Trafegador PWA** — campanhas do funil PWA.
  - **Analista** — auditoria/relatórios de ciclo, veredito de escala.
  - **Analista de Anúncios Ativos na Meta** — pesquisa criativos ativos na Biblioteca de Anúncios.
  - **Copywriter** — copies de performance + descrição visual (entrega pro Editor).
  - **Editor** — transforma copy/briefing em criativo ou especificação visual.
- **Fluxo de criação de criativos:** Analista de Anúncios → Copywriter → Editor.

## 5. Regras/leis que os agentes seguem (resumo)
- **Lances:** começar em *Lances livres* → *Cost cap* → *Bid cap* (nessa ordem de controle).
- **Lei do aprendizado:** ajustar orçamento/lance no máximo **+20% por passo**.
- **Critério de escala:** veredito **ESCALAR** do Analista **+** ≥25 conversões **+** CPA dentro da banda.
- **Compliance iGaming:** comunicação **+18**; **sem** promessa de lucro/ganho garantido; **não** copiar criativos/marcas/logos/rostos de terceiros; foco em entretenimento/experiência.
- As instruções completas de cada agente estão no próprio painel (cada agente tem seu AGENTS.md) e na skill da empresa "alcateia-leis".

## 6. Como continuar editando (tarefas comuns)
- **Criar/ajustar um agente:** painel → Org/Agentes → editar instruções, ícone, a quem reporta, adapter.
- **Dar uma tarefa a um agente:** painel → Tasks/Issues → nova tarefa, atribuir ao agente (sem precisar de projeto). O agente roda sozinho (heartbeat ~30s).
- **Organograma:** painel → Org Chart (arrastar/ajustar hierarquia).
- **Editar conversando (igual falar com o Claude):** abra o **Gerente Geral** no painel e use o **chat**. Ele tem as skills de gestão do Paperclip — peça em linguagem natural: "crie um agente X que reporta a você com estas instruções", "ajuste a hierarquia", "rode uma análise no Analista". Ele executa. Isso consome a chave de API compartilhada (sem assinatura por pessoa).

## 7. Materiais de apoio (no computador do dono)
Estes arquivos foram a base da operação (ficam na pasta do dono `Downloads\paperclip-master\alcateia-agentes\`). A **fonte da verdade agora é o servidor**, mas estes docs ajudam a entender o desenho:
- `agentes/` — instruções de cada agente (01..07).
- `leis/` — 00-SISTEMA, NOMENCLATURA, DECISOES, ALFA-playbook.
- `contratos/` — schemas JSON (ficha de campanha, relatório de status, relatório de análise).
- `LEIA-PRIMEIRO-MAPA-DO-PROJETO.md` — mapa geral do projeto.

## 8. Segurança (importante)
- **Não compartilhe a conta Anthropic do dono.** Não é necessário: o acesso à Alcateia é pelo login próprio no painel (convite), e a IA já roda no servidor.
- **Não reencaminhe o link de convite** para terceiros — ele dá acesso de administrador.
- **Custo:** cada execução de agente consome créditos de API da Anthropic (a chave do servidor). Não há assinatura por pessoa; controle o gasto no painel (custos) e/ou defina orçamento por agente.
- A **chave da Anthropic do servidor** deve ser rotacionada periodicamente; quem tiver acesso ao servidor pode trocá-la em `/etc/paperclip.env` e reiniciar o serviço (`systemctl restart paperclip`).
- Não faça scraping de mídia da Biblioteca de Anúncios do Meta (só dados públicos/links).

## 9. Status atual (o que já está pronto)
- Servidor no ar 24/7 em app.nubomind.com, com login.
- Empresa Alcateia migrada para o servidor com os 7 agentes, instruções e organograma intactos.
- Teste de operação validado (o Gerente Geral executou uma tarefa de ponta a ponta no servidor).
- Pendências pequenas: (a) rotacionar a chave da Anthropic; (b) empresa vazia "Nubomind" sobrou do onboarding (pode ser removida); (c) a skill "alcateia-leis" referencia o ID da empresa antiga (as leis já estão dentro de cada AGENTS.md).
