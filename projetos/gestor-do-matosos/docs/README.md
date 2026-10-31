# Gestor do MatosOS

Painel web para o gestor ver, em uma tela, a situação dos cerca de 10 projetos em andamento: estágio, próxima tarefa, responsável, prazo e quando foi a última atualização.
Como o Matos OS não tem API pública, o painel tem cadastro próprio de projetos, tarefas e responsáveis (o gestor replica as mudanças).
O resumo pode ser filtrado, impresso em A4 e exportado em CSV para reuniões.

## Link de acesso

https://rodrigosilvacio.github.io/claude-squadtech/projetos/gestor-do-matosos/

Funciona no navegador do computador e do celular (a partir de 360 px a lista vira cartões).

## Como entrar

- Use a mesma conta do SquadTech: o e-mail e a senha do Supabase do Rodrigo.
- Não há cadastro público no app.
- **Esqueci minha senha:** na tela de login, informe o e-mail e clique em "Esqueci minha senha". Chega um e-mail com link; ao abrir, o próprio app mostra o campo de nova senha (mínimo 6 caracteres). Se o link estiver expirado, peça um novo.
- **Outras pessoas:** o PRD prevê só o gestor. Se for preciso outra conta, crie o usuário no painel do Supabase (Authentication > Users > Add user, com e-mail e senha). Atenção: cada conta enxerga apenas os próprios dados, então outra pessoa veria um painel vazio, não os projetos do gestor.

## Como usar (perfil: Gestor)

### 1. Cadastrar responsáveis
1. No menu, clique em **Responsáveis**.
2. Digite o nome (até 80 caracteres) e salve.
3. Para excluir, o app avisa quantas tarefas ficarão "Sem responsável" e pede confirmação. A exclusão apaga o nome de vez.

### 2. Criar um projeto
1. No Resumo, clique em **Novo projeto**.
2. Preencha nome, data prevista de entrega e, se quiser, observação (até 500 caracteres). Salve.

### 3. Cadastrar tarefas
1. Na tela do projeto, preencha título, estágio (Briefing, Planejamento, Execução, Revisão, Entrega), responsável (opcional) e data prevista (obrigatória).
2. Salve. O formulário limpa e volta para o título, para cadastrar várias em sequência.
3. As tarefas aparecem agrupadas por estágio. Marque **Concluída** para registrar a conclusão (a data pode ser ajustada). Também dá para editar e excluir.

### 4. Acompanhar no Resumo
- Cada projeto mostra estágio, próxima tarefa, responsável, data, situação (cor e texto) e "Atualizado em".
- Regras automáticas: a próxima tarefa é a pendente com menor data (empate: a cadastrada primeiro); o estágio do projeto é o da próxima tarefa; uma tarefa fica atrasada depois das 23:59:59 da data prevista (horário de Brasília).
- Atrasados aparecem no topo; projetos sem tarefas, no fim.
- Selo **Incompleto**: projeto sem tarefas ou com próxima tarefa sem responsável. O indicador do topo conta esses projetos (a meta é zero).
- Destaque amarelo "Sem atualização há X dias": projeto ativo sem alteração há mais de 7 dias.
- Filtro: Todos ativos (padrão), Atrasado, No prazo, Concluídos.

### 5. Imprimir e exportar
- **Imprimir:** gera A4 da visão filtrada, sem menus, com "Gerado em". Use o botão do app (veja limitações sobre Ctrl+P).
- **Exportar CSV:** baixa a visão filtrada com 6 colunas (projeto, estágio, próxima tarefa, responsável, data prevista, status), pronto para abrir no Excel com acentos.

Rotina sugerida: uma passada diária no Matos OS replicando mudanças, para os dados não ficarem defasados.

## Situação dos testes

7 de 7 testes automáticos passando no navegador (1 rodada de QA): carregamento, login obrigatório, projeto sem tarefas ativo e Incompleto, bloqueio de tarefa sem data, projeto atrasado por tarefa vencida, filtro Concluídos e exclusão de responsável com confirmação. Detalhes em `docs/RELATORIO-TESTES.md`.

### Roteiro de teste manual
- [ ] RF1: sem sessão, consultar as 3 tabelas com a chave publishable e confirmar retorno vazio.
- [ ] RF2: responsável com 3 tarefas; excluir e ver as 3 como Sem responsável e o projeto Incompleto.
- [ ] RF6: duas tarefas pendentes na mesma data; a próxima é a cadastrada primeiro.
- [ ] RF7: próxima tarefa em Revisão deixa o projeto em Revisão.
- [ ] RF8: tarefa prevista 29/10/2026 atrasada às 00:01 de 30/10/2026; concluída antes da data aparece Adiantada.
- [ ] RF9: projeto previsto 30/11/2026 com última conclusão em 20/11/2026 vira Adiantado e sai da visão padrão.
- [ ] RF10: atrasados no topo e projetos sem tarefas no fim.
- [ ] RF13: imprimir em A4, sem menus, com data de geração.
- [ ] RF14: exportar com filtro Atrasado e conferir no Excel colunas, acentos e datas dd/mm/aaaa.
- [ ] RF16: concluir tarefa e ver o horário em "Atualizado em"; projeto parado há 8 dias em amarelo.
- [ ] Responsivo em 360 px e navegação por teclado.
- [ ] Recuperação de senha pelo e-mail.
- [ ] Limpar no banco os projetos de teste (não há exclusão de projeto na interface).

## Onde ficam os dados e LGPD

- Banco Supabase do SquadTech, em três tabelas: `sq_gestor_do_mato_07ca_projetos`, `sq_gestor_do_mato_07ca_tarefas` e `sq_gestor_do_mato_07ca_responsaveis`.
- RLS ativa em todas: cada usuário só lê e grava os próprios registros. Sem login, nada é retornado.
- No navegador só vai a chave publishable; nenhum segredo no repositório.
- Dado pessoal: apenas o nome dos responsáveis (sem e-mail ou telefone), para gestão interna. Excluir um responsável apaga o nome de forma definitiva, sem cópia nas tarefas.
- Em computador compartilhado, clique em **Sair** e feche a aba ao terminar.

## Limitações e pendências conhecidas

Nenhum teste falhou. A revisão de código apontou melhorias ainda não aplicadas:

- **Acesso:** qualquer usuário do Supabase compartilhado consegue entrar e usar o painel com dados próprios (não vê os do gestor). Risco aceito; v2 terá tabela de membros.
- **Ctrl+P:** imprimir pelo atalho sai sem "Gerado em". Use o botão Imprimir.
- **Impressão de visão vazia:** pode sair um cabeçalho de tabela junto de "Nenhum projeto nesta visão.".
- **Indicador de Incompletos:** nos filtros Atrasado e No prazo, pode contar só os da visão. Confira o número na visão Todos ativos.
- **Duplicidade de tarefa:** se aparecer "Não foi possível salvar" ao criar tarefa, recarregue a tela antes de tentar de novo, pois ela pode ter sido gravada.
- **Link de recuperação expirado:** o app volta ao login sem mensagem. Peça outro link.
- **Sessão expirada:** pode passar rapidamente pelo Resumo antes do login.
- **Após Sair:** o conteúdo fica escondido na página até recarregar. Feche a aba em máquina compartilhada.
- **Acessibilidade:** os checkboxes "Concluída" não dizem a qual tarefa pertencem no leitor de tela.
- **Visual:** títulos dos grupos de estágio ganham uma borda a mais na tela do projeto.
- **Login:** o Resumo pode carregar duas vezes logo após entrar (pisca a tela, sem perda de dados).
- Sem exclusão de projeto pela interface (não estava no PRD).
- Dados dependem da replicação manual do Matos OS.

## Fica para depois

- Integração com o Matos OS (API, exportação ou importação de arquivo).
- Importação de tarefas via CSV.
- Edição de estágios pela interface.
- Login da equipe para atualizar as próprias tarefas (com tabela de membros).
- Lembretes por e-mail ou WhatsApp (exige servidor).
- Histórico de mudanças e gráficos de tendência.
- PWA instalável e modo offline.

## Estrutura da pasta

```
gestor-do-matosos/
├── index.html              Esqueleto e containers das telas
├── css/
│   └── estilo.css          Estilos responsivos, acessibilidade e impressão A4
├── js/
│   ├── app.js              Login, navegação, rotas e integração
│   ├── supabase.js         Cliente Supabase e autenticação
│   ├── config.js           URL e chave publishable (gerado pelo squad)
│   ├── dados.js            Acesso às tabelas
│   ├── regras.js           Cálculos de prazo, estágio e situação
│   ├── tela-resumo.js      Tela Resumo, filtro e impressão
│   ├── tela-projeto.js     Detalhe do projeto e tarefas
│   ├── tela-responsaveis.js Cadastro de responsáveis
│   └── exportar.js         Exportação CSV
└── docs/
    ├── PRD.md
    ├── ARQUITETURA.md
    └── RELATORIO-TESTES.md
```
