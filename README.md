# SquadTech

Escritório em pixel art onde 11 agentes de IA levam um briefing até uma **aplicação web funcionando**, com aprovação humana do PRD e da arquitetura. A entrega fica em `projetos/<nome>/`, publicada no próprio GitHub Pages.

- PRD: [`docs/PRD-squadtech.md`](docs/PRD-squadtech.md)
- Site: `https://rodrigosilvacio.github.io/claude-squadtech/`
- Projetos entregues: `https://rodrigosilvacio.github.io/claude-squadtech/projetos/`

## O squad

| Sala | Agentes |
|---|---|
| 1 · Produto | Ana (PO Entrevistadora), Bruno (PO Redator e Crítico) |
| 2 · Arquitetura | Carla (Proponente), Diego (Revisor) |
| 3 · Desenvolvimento | Eduardo (Tech Lead), Fernanda, Gabriel, Helena (Devs) |
| 4 · Testes | Igor (QA Funcional), Júlia (QA de Código e Segurança) |
| 5 · Delivery | Lucas |

## Status

| Fase | Entrega | Status |
|---|---|---|
| 0 · Fundação | Escritório visual, tabelas `squad_*`, login, demonstração encenada | ✅ |
| 1 · Produto | Sala 1 real (Ana e Bruno na Claude API) + Portão 1 | ✅ |
| 2 · Arquitetura | Sala 2 real (Carla e Diego) + Portão 2 + executor seguro de SQL | ✅ |
| 3 · Dev + Delivery | Devs geram o código, Eduardo integra, Lucas documenta e faz o commit em `projetos/` | ✅ |
| 4 · Testes | QA no navegador (Igor e Júlia) com loop de correção | Próxima |

## Estrutura

```
index.html            escritório (sem build: HTML + JS modules + Canvas)
css/escritorio.css
js/
  mapa.js             planta das 5 salas, móveis e pathfinding
  agentes.js          os 11 agentes (nome, cargo, mesa, visual)
  sprites.js          pixel art própria, desenhada em código
  motor.js            loop de animação, movimento, balões
  diretor.js          transforma eventos em coreografia
  simulador.js        roteiro da demonstração
  ui.js               trilha, conversa, artefatos, portões
  nuvem.js            Supabase (login e projetos)
  main.js             liga tudo
vendor/               supabase-js, marked e DOMPurify com versão fixa
supabase/migrations/  SQL aplicado no projeto ClaudeProjects
supabase/functions/
  squad-pedir/        ações do usuário (criar, responder, decidir, retomar), com login
  squad-esteira/      executa um passo da esteira por invocação (chamada pelo banco)
    nucleo.ts           banco, eventos e chamada ao Claude
    sala-produto.ts     Ana e Bruno
    sala-arquitetura.ts Carla e Diego, validação do plano e migração
    sala-desenvolvimento.ts Eduardo, Fernanda, Gabriel e Helena
    sala-delivery.ts    Lucas: docs, config.js, portfólio e commit
    verificacoes.ts     checagem automática do código gerado
    github.ts           commit atômico via Git Data API
    sql.ts              validador do SQL gerado (1ª barreira)
    prompts.ts          personas, regras técnicas e formatos JSON
projetos/             apps entregues pelo squad (um por pasta)
```

## Rodar localmente

```bash
python3 -m http.server 8000
# abra http://localhost:8000
```

## Como a esteira roda

1. O navegador chama `squad-pedir` (usuário logado e presente em `squad_usuarios`).
2. Mudanças de `etapa`/`subpasso` em `squad_projetos` disparam um trigger, que chama `squad-esteira` via `pg_net`.
3. A esteira executa **um** passo (uma chamada ao `claude-opus-5-5`, cabe em ~150s), grava eventos e avança o projeto.
4. O escritório recebe os eventos por Realtime (com polling de segurança a cada 6s) e anima a conversa.
5. O cron `squad-reenviar-paradas` (a cada 2 min) reenvia passos parados; depois de 3 tentativas, o projeto mostra "Retomar".

Sala 1 (Produto): `ana_analisa → bruno_critica → ana_pergunta → [suas respostas] → bruno_escreve → ana_revisa → bruno_ajusta → [Portão 1]`.

Sala 2 (Arquitetura): `carla_propoe → carla_sql → diego_revisa → carla_ajusta → [Portão 2] → diego_aplica (migração)`.

Sala 3 (Desenvolvimento): `eduardo_planeja (contrato de integração) → dev_arquivo (um arquivo por invocação) → eduardo_integra → dev_corrige`.

Sala 5 (Delivery): `lucas_documenta (README, PRD, arquitetura, relatório, config.js) → lucas_publica (commit em projetos/<slug>/ + projetos/index.html)`.

## Configuração da entrega no GitHub

O Lucas faz o commit com um token guardado como secret nas Edge Functions do Supabase:

1. GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token.
2. Repository access: **Only select repositories** → `claude-squadtech`.
3. Permissions → Repository permissions → **Contents: Read and write** (o resto fica sem acesso).
4. Supabase → projeto ClaudeProjects → Edge Functions → **Secrets** → nome `GITHUB_TOKEN_SQUAD`, valor = o token.

Sem o secret, a esteira para no passo de publicação com uma mensagem clara; depois de configurar, é só clicar em **Retomar**.

## SQL gerado pelos agentes

O projeto Supabase é compartilhado com outros apps, então o SQL da Carla passa por duas barreiras:

1. **`sql.ts` (esteira):** só `create table`, `alter table`, `create [unique] index`, `create policy`, `insert into` e `comment on`, sempre em `public.<prefixo>*`; RLS obrigatório em toda tabela criada; sem funções, triggers, `DROP`, `GRANT`, blocos `$` ou leitura de `auth.users`.
2. **`squad_executar_migracao` (banco):** repete as checagens comando a comando, aplica tudo numa transação só e confere RLS ligado no fim. Só a service role executa.

O prefixo é único por projeto (`sq_<slug curto>_<4 hex do id>_`) e o SQL só roda depois do Portão 2.

## Eventos

O escritório é dirigido por eventos no formato da tabela `squad_eventos`:
`{ tipo, agente, para, sala, texto, dados }`, com `tipo` em `fase`, `fala`, `estado`, `reunir`, `handoff`, `artefato`, `portao`, `sistema` e `fim`. A demonstração e a esteira real usam o mesmo formato; a coreografia (andar até a mesa de reunião, levar o documento) é decidida no front, pelo `diretor.js`.
