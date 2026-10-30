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
| 1 · Produto | Sala 1 real + Portão 1 | Próxima |
| 2 · Arquitetura | Sala 2 real + Portão 2 | |
| 3 · Dev + Delivery | Commit em `projetos/` | |
| 4 · Testes + Dados | QA no navegador + migrações | |

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
projetos/             apps entregues pelo squad (um por pasta)
```

## Rodar localmente

```bash
python3 -m http.server 8000
# abra http://localhost:8000
```

## Eventos

O escritório é dirigido por eventos no formato da tabela `squad_eventos`:
`{ tipo, agente, para, sala, texto, dados }`, com `tipo` em `fase`, `fala`, `estado`, `reunir`, `handoff`, `artefato`, `portao`, `sistema` e `fim`. A demonstração e a esteira real usam o mesmo formato; a coreografia (andar até a mesa de reunião, levar o documento) é decidida no front, pelo `diretor.js`.
