# PRD · Gestor do MatosOS

Owner: Rodrigo Silva · Versão 1.1 · Data: 30/10/2026

## 1. Resumo executivo
Painel web para o gestor acompanhar os cerca de 10 projetos em andamento: estágio, próxima tarefa, responsável e situação de prazo.
Como o Matos OS não tem API pública conhecida, o painel terá cadastro próprio de projetos, tarefas e responsáveis.
MVP estático (GitHub Pages + Supabase), com resumo em tela única, impressão e exportação CSV.

## 2. Contexto e problema
Hoje o gestor precisa entrar no Matos OS (https://matos-projects-os.netlify.app/) e navegar projeto a projeto para saber o andamento. Não existe uma visão consolidada que responda rapidamente: em que estágio cada trabalho está, qual a próxima tarefa, quem é o responsável e se está no prazo, adiantado ou atrasado. Ler o Matos OS automaticamente exigiria API ou raspagem no servidor, fora da nossa stack; por isso a v1 usa cadastro manual, viável para cerca de 10 projetos com até 15 tarefas cada.

## 3. Usuários e jobs to be done
| Usuário | Job to be done | Frequência |
|---|---|---|
| Gestor (único usuário com login) | Ver em menos de 1 minuto a situação de todos os projetos ativos | Diária |
| Gestor | Cadastrar e atualizar projetos, tarefas, datas e status | Diária / semanal |
| Gestor | Imprimir ou exportar o resumo para reuniões e alinhamentos | Semanal |
| Responsáveis (equipe) | Não acessam; aparecem só pelo nome | n/a |

## 4. Objetivos e não objetivos
**Objetivos**
- Consolidar em uma tela o status de todos os projetos ativos.
- Calcular automaticamente estágio, próxima tarefa e situação de prazo a partir das tarefas.
- Mostrar quando cada projeto foi atualizado pela última vez.
- Permitir impressão e exportação CSV do resumo.

**Não objetivos**
- Integração automática com o Matos OS (sem API pública; exigiria servidor). Fase futura.
- Acesso da equipe, perfis e permissões múltiplas.
- Notificações automáticas por e-mail ou WhatsApp (exigem segredo no servidor).
- Gráficos de Gantt, controle de horas, custos ou anexos.
- App mobile nativo (o painel é responsivo).

## 5. Métricas de sucesso
| Métrica | Meta | Como medir |
|---|---|---|
| Tempo para ver o status de todos os projetos | < 1 minuto | Teste cronometrado do gestor ao abrir o painel logado |
| Projetos ativos com próxima tarefa e responsável preenchidos | 100% | Indicador no topo do painel (contagem de projetos Incompletos = 0) |

## 6. Requisitos funcionais
- **RF1 · Login:** o painel só abre após login com e-mail e senha via Supabase Auth na conta do gestor. Sem cadastro público.
- **RF2 · Responsáveis:** o gestor cria, edita e exclui responsáveis apenas com nome (obrigatório, até 80 caracteres). Ao excluir um responsável, o registro é apagado e as tarefas vinculadas passam a "Sem responsável", sem guardar cópia do nome. Antes de excluir, o sistema avisa quantas tarefas serão afetadas e pede confirmação.
- **RF3 · Projetos:** o gestor cria e edita projeto com nome (obrigatório), data prevista de entrega (obrigatória) e observação opcional (até 500 caracteres).
- **RF4 · Estágios:** existem 5 estágios padrão, em ordem: Briefing, Planejamento, Execução, Revisão, Entrega. Na v1 não são editáveis pela interface.
- **RF5 · Tarefas:** cada tarefa tem título, estágio, responsável (opcional, exibido como "Sem responsável" quando vazio), data prevista (obrigatória), ordem de cadastro e status (pendente ou concluída). Ao concluir, o sistema grava a data de conclusão (editável).
- **RF6 · Próxima tarefa:** é a tarefa não concluída com a menor data prevista; empate decidido pela ordem de cadastro.
- **RF7 · Estágio do projeto:** é o estágio da próxima tarefa. Projeto com ao menos uma tarefa e nenhuma pendente é "Concluído". Projeto sem nenhuma tarefa cadastrada é ativo, com estágio "Sem tarefas".
- **RF8 · Situação da tarefa:** atrasada se não concluída após 23:59:59 da data prevista (horário de Brasília); adiantada se concluída antes da data prevista; no prazo nos demais casos.
- **RF9 · Situação do projeto:** Atrasado se qualquer tarefa estiver atrasada; No prazo se ativo sem atrasos (inclui projeto sem tarefas); Adiantado se concluído antes da data prevista do projeto; Concluído no prazo se concluído na data; Concluído com atraso se após.
- **RF10 · Tela Resumo:** tabela/cartões com projeto, estágio, próxima tarefa, responsável, data prevista da próxima tarefa, situação (com cor e texto) e "Atualizado em" (RF16). Ordenação: atrasados primeiro, depois por data prevista da próxima tarefa; projetos sem tarefas no fim.
- **RF11 · Filtros:** filtro por situação (Todos ativos, Atrasado, No prazo, Concluídos). Concluídos lista só projetos com ao menos uma tarefa e nenhuma pendente. Projetos sem tarefas são ativos. Concluídos não aparecem na visão padrão.
- **RF12 · Pendências de cadastro:** projeto ativo sem nenhuma tarefa, ou cuja próxima tarefa está sem responsável, aparece com selo "Incompleto" e é contado no indicador do topo.
- **RF13 · Imprimir:** botão "Imprimir" gera versão para papel A4 da visão filtrada atual, com data/hora de geração.
- **RF14 · Exportar CSV:** botão "Exportar CSV" baixa a visão filtrada com colunas fixas: projeto, estágio, próxima tarefa, responsável, data prevista, status (UTF-8 com BOM, separador ponto e vírgula, datas dd/mm/aaaa).
- **RF15 · Detalhe do projeto:** ao clicar no projeto, abre tela com todas as tarefas agrupadas por estágio, onde o gestor marca conclusão e edita dados.
- **RF16 · Última atualização:** cada projeto guarda data e hora (Brasília) da última criação, edição, conclusão ou exclusão no próprio projeto ou em qualquer de suas tarefas. O resumo exibe "Atualizado em dd/mm/aaaa hh:mm" e destaca em amarelo, com texto "Sem atualização há X dias", projetos ativos sem alteração há mais de 7 dias.

## 7. Requisitos não funcionais
- **Stack:** HTML, CSS e JS (ES modules) sem build, no GitHub Pages; bibliotecas via CDN com versão fixa (ex.: supabase-js fixado).
- **Segurança:** apenas chave publishable no front; RLS ativa em todas as tabelas permitindo leitura e escrita só ao user_id do gestor; nenhum segredo no repositório.
- **LGPD:** dados pessoais mínimos (só nome dos responsáveis, sem e-mail ou telefone); finalidade de gestão interna; a exclusão de um responsável apaga o nome de forma definitiva, sem cópia em tarefas.
- **Desempenho:** resumo carrega em até 2 s com 10 projetos e 150 tarefas em conexão 4G.
- **Acessibilidade:** situação indicada por texto além da cor, contraste AA, navegação por teclado, labels em todos os campos.
- **Responsivo:** funciona de 360 px (cartões) a desktop (tabela).
- **Fuso:** todos os cálculos de prazo e a última atualização em America/Sao_Paulo.

## 8. Critérios de aceite
- **RF1:** Dado um visitante sem login, Quando abre o painel, Então vê só a tela de login e nenhum dado é retornado pelo Supabase.
- **RF2:** Dado um responsável vinculado a 3 tarefas, Quando o gestor confirma a exclusão, Então as 3 tarefas exibem "Sem responsável", o nome não existe mais em nenhuma tabela e projetos cuja próxima tarefa foi afetada aparecem como Incompleto.
- **RF5:** Dado o formulário de tarefa, Quando o gestor salva sem data prevista, Então o sistema bloqueia e mostra "Data prevista obrigatória".
- **RF6:** Dado um projeto com duas tarefas pendentes de mesma data, Quando o resumo carrega, Então a próxima tarefa é a cadastrada primeiro.
- **RF7:** Dada a próxima tarefa no estágio Revisão, Quando o resumo carrega, Então o projeto aparece no estágio Revisão.
- **RF7:** Dado um projeto recém-criado sem tarefas, Quando o resumo carrega, Então ele aparece na visão padrão com estágio "Sem tarefas" e situação No prazo.
- **RF8:** Dada uma tarefa pendente com data prevista 29/10/2026, Quando o painel é aberto em 30/10/2026 às 00:01 (Brasília), Então ela aparece como atrasada.
- **RF8:** Dada uma tarefa com data prevista 05/11/2026, Quando é concluída em 01/11/2026, Então aparece como adiantada.
- **RF9:** Dado um projeto com 1 tarefa atrasada entre 12, Quando o resumo carrega, Então o projeto aparece como Atrasado.
- **RF9:** Dado um projeto com data prevista 30/11/2026, Quando a última tarefa é concluída em 20/11/2026, Então o projeto vira Adiantado e sai da visão padrão.
- **RF10:** Dados projetos atrasados e no prazo, Quando o resumo carrega, Então os atrasados aparecem no topo.
- **RF11:** Dado o filtro Concluídos, Quando selecionado, Então só aparecem projetos com ao menos uma tarefa e nenhuma pendente; projetos sem tarefas não são listados.
- **RF12:** Dado um projeto ativo cuja próxima tarefa não tem responsável, Quando o resumo carrega, Então ele exibe "Incompleto" e o indicador do topo soma 1.
- **RF12:** Dado um projeto ativo sem nenhuma tarefa, Quando o resumo carrega, Então ele exibe "Incompleto" e é contado no indicador do topo.
- **RF13:** Dada qualquer visão, Quando o gestor clica Imprimir, Então a impressão cabe em A4 sem menus e com data de geração.
- **RF14:** Dada a visão filtrada em Atrasado, Quando o gestor exporta, Então o CSV contém só esses projetos e as 6 colunas na ordem definida, abrindo corretamente no Excel com acentos.
- **RF16:** Dado um projeto, Quando o gestor conclui uma de suas tarefas às 14:30 de 02/11/2026, Então o resumo mostra "Atualizado em 02/11/2026 14:30".
- **RF16:** Dado um projeto ativo sem alterações há 8 dias, Quando o resumo carrega, Então ele aparece destacado com "Sem atualização há 8 dias".

## 9. Premissas assumidas
- Integração com o Matos OS fica para fase futura; v1 com cadastro próprio.
- Estágios padrão fixos na v1: Briefing, Planejamento, Execução, Revisão, Entrega.
- Estágio do projeto derivado da próxima tarefa; projeto sem tarefas é ativo e Incompleto.
- Próxima tarefa: primeira não concluída por data prevista, desempate por ordem de cadastro.
- Atraso conta após o fim do dia da data prevista, horário de Brasília.
- Adiantado só para projeto concluído antes da data prevista do projeto.
- Só o gestor acessa e atualiza; a equipe segue no Matos OS e o gestor replica as mudanças no painel.
- Projeto sem alteração há mais de 7 dias é sinalizado como possivelmente desatualizado.
- Resumo em tela única para até 10 projetos ativos, com impressão e CSV.

## 10. Riscos e dependências
| Risco / dependência | Impacto | Mitigação |
|---|---|---|
| Dados desatualizados por depender de replicação manual do Matos OS | Alto | "Atualizado em" e alerta de 7 dias no resumo (RF16); rotina diária sugerida ao gestor |
| Carga inicial de ~150 tarefas | Médio | Formulário rápido com adição em sequência; importação CSV avaliada na v2 |
| Conta Supabase do SquadTech e usuário do gestor criados | Alto | Pré-requisito antes do desenvolvimento |
| RLS mal configurada expor dados | Alto | Teste de acesso anônimo nos critérios de aceite |
| Exclusão de responsável por engano | Médio | Confirmação com contagem de tarefas afetadas (RF2) |
| Crescimento além de 10 projetos | Baixo | Layout suporta rolagem; paginação se passar de 30 |

## 11. Fora desta versão (backlog)
- Integração com o Matos OS (API, exportação ou importação de arquivo).
- Importação de tarefas via CSV.
- Edição de estágios pela interface.
- Acesso da equipe com login próprio e atualização das próprias tarefas.
- Lembretes por e-mail/WhatsApp (exige servidor).
- Histórico detalhado de mudanças e gráficos de tendência.
- PWA instalável e modo offline.
