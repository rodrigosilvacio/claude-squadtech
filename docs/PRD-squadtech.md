# PRD · SquadTech, o escritório de agentes de desenvolvimento

| Campo | Valor |
|---|---|
| Owner | Rodrigo Silva |
| Versão | 1.0 (para aprovação) |
| Data | 30/10/2026 |
| Status | Aguardando aprovação |
| Repositório | `rodrigosilvacio/claude-squadtech` |
| Publicação | GitHub Pages (`rodrigosilvacio.github.io/claude-squadtech/`) |
| Backend | Supabase `ClaudeProjects` (sa-east-1), Edge Functions + Claude API (`claude-opus-5-5`) |

---

## 1. Resumo executivo

O SquadTech é um escritório em pixel art onde 11 agentes de IA, com nome e cargo, transformam um briefing em uma **aplicação web funcionando**. O usuário acompanha visualmente o trabalho em 5 salas (PO, Arquitetura, Desenvolvimento, Testes e Delivery), lê as conversas entre os agentes, aprova o PRD e a arquitetura e recebe a solução numa pasta `projetos/<nome>/` publicada no próprio GitHub Pages.

A aposta: tornar visível e governável o ciclo completo de produto com IA (discovery, desenho, construção, teste e entrega), com o humano decidindo nos portões certos.

## 2. Contexto e problema

- Ferramentas de "vibe coding" geram código rápido, mas pulam discovery, arquitetura e testes. O resultado funciona na demo e quebra no uso.
- O `pixel-agents` mostra agentes do Claude Code trabalhando, mas **só visualiza** sessões locais. Não orquestra um processo de produto e não roda no GitHub Pages.
- Falta um artefato que **demonstre, de forma visual e didática**, como um squad de IA bem governado trabalha, servindo como portfólio, demo em workshops e ferramenta real de prototipagem.

## 3. Usuário e jobs to be done

**Usuário único (MVP):** Rodrigo, CIO, usando para prototipar soluções e demonstrar o processo em workshops e eventos.

| Job | Quando eu... | Quero... | Para... |
|---|---|---|---|
| Prototipar | tenho uma ideia de app | descrever em texto e responder perguntas | receber um app web funcionando sem programar |
| Governar | a IA vai decidir escopo e desenho | aprovar o PRD e a arquitetura antes do código | não pagar caro por erro de requisito |
| Demonstrar | estou num workshop | mostrar agentes conversando e se movendo entre salas | explicar o ciclo de produto com IA de forma visual |
| Reutilizar | o app ficou pronto | ter os arquivos e a documentação numa pasta | testar, evoluir e mostrar no portfólio |

## 4. Objetivos e não objetivos

### Objetivos
1. Briefing → app web funcionando em `projetos/<nome>/`, com documentação, em cerca de 15 minutos de processamento (sem contar o tempo de resposta do usuário).
2. Dois portões humanos obrigatórios: aprovação do PRD e da arquitetura.
3. Conversas e decisões dos agentes visíveis em tempo real.
4. Testes automáticos reais executados antes da entrega.
5. Todo projeto salvo e reabrível. Botão "Novo projeto" sempre visível.

### Não objetivos (MVP)
- Apps com backend próprio, Python, mobile nativo ou frameworks que exigem build (o PO avisa e recusa).
- Múltiplos usuários, times ou cobrança.
- Edição do código gerado dentro do escritório (evolução vira novo projeto ou fase 2).
- Publicação fora do GitHub Pages.
- Uso dos sprites do pacote JIK-A-4 (licença de terceiros). Sprites próprios.

## 5. O squad (nomes e cargos)

| Sala | Agente | Cargo | Responsabilidade |
|---|---|---|---|
| 1 · Produto | **Ana** | PO Entrevistadora | Lê o briefing e faz as perguntas ao usuário |
| 1 · Produto | **Bruno** | PO Redator e Crítico | Aponta lacunas, escreve o PRD |
| 2 · Arquitetura | **Carla** | Arquiteta Proponente | Desenha a solução: telas, arquivos, dados, SQL, plano de tarefas |
| 2 · Arquitetura | **Diego** | Arquiteto Revisor | Revisa segurança, viabilidade no Pages, RLS e custo |
| 3 · Desenvolvimento | **Eduardo** | Tech Lead | Divide as tarefas por arquivo, integra e garante consistência |
| 3 · Desenvolvimento | **Fernanda** | Dev | Implementa tarefas |
| 3 · Desenvolvimento | **Gabriel** | Dev | Implementa tarefas |
| 3 · Desenvolvimento | **Helena** | Dev | Implementa tarefas |
| 4 · Testes | **Igor** | QA Funcional | Escreve os testes automáticos e o roteiro |
| 4 · Testes | **Júlia** | QA de Código e Segurança | Revisão estática, segurança, acessibilidade básica |
| 5 · Delivery | **Lucas** | Delivery | Empacota, documenta, faz o commit e entrega o link |

## 6. Fluxo (esteira)

```
[Usuário: briefing]
      │
      ▼
SALA 1 · PRODUTO ── Ana pergunta ⇄ usuário responde (até 3 rodadas)
      │             Bruno aponta lacunas e escreve o PRD
      ▼
◆ PORTÃO 1: usuário aprova o PRD ──(ajustes)──► volta à Sala 1
      │
      ▼
SALA 2 · ARQUITETURA ── Carla propõe ⇄ Diego revisa
      │
      ▼
◆ PORTÃO 2: usuário aprova a arquitetura (+ SQL) ──(ajustes)──► volta à Sala 2
      │
      ▼
[Migração no Supabase, se houver]
      │
      ▼
SALA 3 · DEV ── Eduardo divide em tarefas ► Fernanda, Gabriel, Helena e Eduardo
      │         implementam em paralelo ► Eduardo integra
      ▼
SALA 4 · TESTES ── Júlia revisa o código │ Igor escreve os testes
      │            o navegador roda os testes no iframe isolado
      │            ✗ falhou → volta à Sala 3 (máx. 3 rodadas, depois escala ao usuário)
      ▼
SALA 5 · DELIVERY ── Lucas gera a documentação e faz o commit em projetos/<nome>/
      │
      ▼
[Usuário recebe link do app + pasta + zip]
```

**Handoff visual:** a cada passagem de fase, um agente sai da sala com o documento e caminha até a próxima.

## 7. Requisitos funcionais

### RF1 · Escritório visual
- RF1.1 Mapa único com as 5 salas visíveis ao mesmo tempo, em pixel art com sprites próprios.
- RF1.2 Cada agente tem sprite, nome e cargo (tooltip ao passar o mouse).
- RF1.3 Animações por estado: ocioso, andando, digitando, lendo, conversando, aguardando o usuário (ícone "!") e erro.
- RF1.4 Balões curtos (até cerca de 80 caracteres) sobre o agente que fala.
- RF1.5 Indicador da fase atual e do progresso geral.

### RF2 · Painel de conversa e artefatos
- RF2.1 Log completo, em tempo real, das mensagens entre os agentes e com o usuário, filtrável por sala.
- RF2.2 Quadro de artefatos: Briefing, Perguntas e respostas, PRD, Arquitetura, Tarefas, Código, Relatório de testes, Entrega.
- RF2.3 PRD e arquitetura renderizados em Markdown legível.

### RF3 · Interação do usuário
- RF3.1 Campo de texto para o briefing e botão "Novo projeto", sempre visível.
- RF3.2 Responder as perguntas da Ana num formulário (uma resposta por pergunta, com opção "decida você").
- RF3.3 Portões: botões "Aprovar" e "Pedir ajustes" (com campo de comentário) no PRD e na arquitetura.
- RF3.4 Lista de projetos anteriores, com status, para reabrir e acompanhar.
- RF3.5 Botão "Retomar" quando uma etapa parar com erro.

### RF4 · Geração da solução
- RF4.1 Apenas web estático: HTML, CSS e JavaScript (ES modules), bibliotecas só via CDN com versão fixa.
- RF4.2 Se houver dados, Supabase com tabelas prefixadas `sq_<slug>_`, RLS obrigatório e chave publishable. Nunca a service role no front.
- RF4.3 Limites por projeto: até 15 arquivos e até cerca de 60 mil caracteres por arquivo.

### RF5 · Testes
- RF5.1 Igor gera testes em JavaScript (smoke tests: página carrega, sem erro no console, elementos-chave existem, fluxos principais funcionam).
- RF5.2 O navegador do usuário roda o app num iframe sandbox, executa os testes e devolve o resultado para a esteira.
- RF5.3 Júlia faz a revisão estática (segurança, segredos expostos, XSS, RLS, acessibilidade básica).
- RF5.4 Falha → bugs voltam ao Eduardo com o trecho e a correção esperada. Máximo de 3 rodadas, depois escala ao usuário.

### RF6 · Entrega
- RF6.1 Commit único via GitHub API em `projetos/<slug>/` na branch `main`.
- RF6.2 Estrutura da pasta:
  ```
  projetos/<slug>/
  ├── index.html
  ├── (css/, js/, assets/)
  └── docs/
      ├── README.md            como usar e como testar
      ├── PRD.md
      ├── ARQUITETURA.md       inclui o SQL aplicado, se houver
      └── RELATORIO-TESTES.md
  ```
- RF6.3 Link do app no Pages, link da pasta no GitHub e download em zip.
- RF6.4 Índice `projetos/index.html` atualizado com todos os apps entregues (portfólio).

## 8. Requisitos não funcionais

| Tema | Requisito |
|---|---|
| Segurança | `ANTHROPIC_API_KEY`, token do GitHub e service role só nas Edge Functions. Front usa só a chave publishable |
| Acesso | Login no Supabase Auth + allowlist `squad_usuarios` (só o Rodrigo). RLS em todas as tabelas `squad_*` |
| SQL gerado | Só aplicado após o Portão 2. Executor valida: apenas `CREATE TABLE/INDEX/POLICY` e `ALTER TABLE` em objetos `sq_<slug>_*`, RLS obrigatório. Bloqueia `DROP`, `TRUNCATE`, `GRANT`, funções e schemas `auth`/`storage` |
| Código gerado | Exibido só em iframe sandbox. Sem `eval` e sem segredos. Júlia reprova se encontrar |
| Tempo | Cada etapa cabe em uma invocação (cerca de 150s). Trava contra execução duplicada |
| Custo | Teto de tokens por projeto e limite de projetos por dia em `squad_config` |
| Rastreabilidade | Todo passo vira evento em `squad_eventos`. Todo artefato é versionado |
| LGPD | O briefing pode conter dados do negócio. Nada é enviado a terceiros além da Anthropic e do GitHub |
| Compatibilidade | Escritório funciona em desktop (Chrome, Edge, Safari). Mobile só para acompanhar |

## 9. Arquitetura proposta (alto nível)

| Camada | Escolha | Motivo |
|---|---|---|
| Front do escritório | HTML + JS modules + Canvas, **sem build** | Pages publica direto da `main`, e as pastas `projetos/` ficam no ar sem pipeline |
| Tempo real | Supabase Realtime em `squad_eventos` | Mesmo padrão já validado no seu escritório atual |
| Orquestração | Trigger no banco + `pg_net` → `squad-esteira` (uma etapa por chamada) | Respeita o limite de tempo e permite retomar |
| Ações do usuário | `squad-pedir` (criar, responder, aprovar, ajustar, retomar, resultado de testes) | Um único ponto autenticado |
| Entrega | `squad-esteira` (etapa delivery) → GitHub API (Git Trees, commit único) | Commit atômico da pasta |
| Modelo | `claude-opus-5-5` em todos os agentes, com saída em JSON Schema | Decisão do owner: qualidade máxima |

**Tabelas:** `squad_config`, `squad_usuarios`, `squad_projetos`, `squad_eventos`, `squad_artefatos`, `squad_tarefas`, `squad_testes`.

## 10. Métricas de sucesso

| Métrica | Meta MVP |
|---|---|
| Projetos entregues sem escalar ao usuário | ≥ 70% |
| Tempo de processamento briefing → entrega | ≤ 15 min (mediana) |
| Apps que abrem no Pages sem erro no console | ≥ 90% |
| Média de rodadas de QA | ≤ 1,5 |
| Custo por projeto | Medido e exibido (linha de base no piloto) |
| Ajustes pedidos no Portão 1 | Acompanhar (indica a qualidade do discovery) |

## 11. Critérios de aceite

1. **Dado** que estou logado, **quando** digito um briefing e clico em "Iniciar", **então** a Ana caminha até a mesa, aparece "lendo" e em seguida exibe as perguntas para mim.
2. **Dado** que respondi as perguntas, **quando** o Bruno conclui, **então** vejo o PRD renderizado e os botões "Aprovar" e "Pedir ajustes".
3. **Dado** que pedi ajustes na arquitetura com um comentário, **quando** envio, **então** o projeto volta à Sala 2 e a Carla gera uma nova versão considerando o comentário.
4. **Dado** que a arquitetura inclui SQL, **quando** aprovo, **então** apenas tabelas `sq_<slug>_*` com RLS são criadas, e qualquer comando fora da regra é bloqueado e registrado.
5. **Dado** que um teste falhou, **quando** o QA conclui, **então** o projeto volta à Sala 3 com a lista de bugs, e após a 3ª falha o escritório para e me pede uma decisão.
6. **Dado** que os testes passaram, **quando** o Lucas termina, **então** existe um commit com `projetos/<slug>/` na `main`, e vejo o link do Pages, o link do GitHub e o zip.
7. **Dado** que estou em qualquer tela, **quando** clico em "Novo projeto", **então** o escritório volta ao estado inicial, sem perder os projetos anteriores.
8. **Dado** que vejo o painel de conversa, **quando** os agentes trocam mensagens, **então** cada mensagem aparece em tempo real com nome, cargo, sala e horário.

## 12. Riscos e mitigação

| Risco | Impacto | Mitigação |
|---|---|---|
| SQL gerado afetar outros apps do Supabase compartilhado | Alto | Prefixo obrigatório, executor com allowlist de comandos, aplicação só após aprovação |
| Código gerado com bug ou inseguro | Médio | QA em duas frentes, loop limitado, iframe sandbox |
| Etapa estourar o tempo de 150s | Médio | Tarefas por arquivo, retentativa, botão "Retomar" |
| Custo alto com Opus em todos os agentes | Médio | Teto de tokens por projeto, custo exibido, limite diário |
| Pages demorar a publicar após o commit | Baixo | Preview imediato no iframe + aviso "publicando (cerca de 1 min)" |
| Token do GitHub vazar | Alto | Fine-grained, só este repositório, só `Contents`, guardado como secret |
| Briefing pedir algo fora de web estático | Baixo | Ana e Bruno recusam e explicam a alternativa |

## 13. Dependências

- [x] Projeto Supabase `ClaudeProjects` com `ANTHROPIC_API_KEY`
- [ ] GitHub Pages ativado na `main` (raiz)
- [ ] Fine-grained token `Contents: write` só neste repositório, salvo como secret `GITHUB_TOKEN_SQUAD` (necessário a partir da Fase 3)
- [ ] Sua conta incluída em `squad_usuarios`

## 14. Plano de entrega (fases demonstráveis)

| Fase | Entrega | Demo ao final |
|---|---|---|
| 0 · Fundação | Repositório, Pages, tabelas, login, escritório visual com os 11 agentes animados por eventos simulados | Escritório no ar, agentes andando entre salas |
| 1 · Produto | Sala 1 real + Portão 1 | Briefing → perguntas → PRD aprovado |
| 2 · Arquitetura | Sala 2 real + Portão 2 com ajustes | PRD → arquitetura aprovada |
| 3 · Dev + Delivery | Sala 3, Sala 5 e commit no GitHub | Primeiro app entregue em `projetos/` |
| 4 · Testes + Dados | Sala 4 com loop + migrações no Supabase | App com banco, testado e entregue |

## 15. Fora deste PRD (registrado)

- Correção do alerta crítico do Supabase: 4 tabelas sem RLS (`whatsapp_groups`, `raw_messages`, `summarized_topics`, `daily_summaries`). Tratar à parte, junto com as políticas do app que as usa.
