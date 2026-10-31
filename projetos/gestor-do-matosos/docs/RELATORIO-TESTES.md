# Relatório de testes · Gestor do MatosOS

**Situação:** 7 de 7 testes automáticos passando no navegador, em 1 rodada de QA.

## Testes automáticos no navegador (Igor)

| Teste | Resultado |
|---|---|
| C1 · index.html carrega sem erros | passou |
| T1 · RF1: sem login só aparece a tela de login | passou |
| T2 · RF7/RF12: projeto sem tarefas aparece ativo e Incompleto | passou |
| T3 · RF5: tarefa sem data prevista é bloqueada | passou |
| T4 · RF8/RF9: tarefa vencida deixa projeto Atrasado | passou |
| T5 · RF11: Concluídos não lista projeto sem tarefas | passou |
| T6 · RF2: excluir responsável com confirmação | passou |

## Pendências

- Nenhuma.

## Correções feitas pelo QA

- Nenhuma.

## Revisão de código e segurança (Júlia): melhorias sugeridas

- **css/estilo.css**: No print, a regra .tabela-resumo { display: table !important } vem depois de [hidden] e tem a mesma especificidade. Com a visão vazia, a impressão mostra uma tabela só com cabeçalho junto de 'Nenhum projeto nesta visão.' _Correção:_ No @media print, acrescentar .tabela-resumo[hidden] { display: none !important; } depois das regras da tabela.
- **css/estilo.css**: O seletor [id^="estagio-"] também pega os h3 estagio-titulo-N. Cada título ganha borda, fundo e padding de painel dentro do próprio grupo. _Correção:_ Estilizar só .grupo-estagio, ou usar [id^="estagio-"]:not([id^="estagio-titulo-"]).
- **js/tela-resumo.js**: #resumo-gerado-em só é preenchido pelo botão Imprimir. Com Ctrl+P, o papel sai sem data de geração (RF13). _Correção:_ Registrar uma vez window.addEventListener('beforeprint', ...) que preenche #resumo-gerado-em com formatarDataHora(new Date().toISOString()).
- **js/tela-projeto.js**: Todos os checkboxes têm o mesmo label 'Concluída'. No leitor de tela não dá para saber de qual tarefa é cada um. _Correção:_ Incluir o título no rótulo acessível, por exemplo aria-label=`Concluída: ${t.titulo}` no checkbox, ou um span visualmente-oculto dentro do label.
- **js/dados.js**: Em criarTarefa e editarTarefa, se tocarProjeto falhar depois do insert, a tela mostra 'Não foi possível salvar'. O gestor tenta de novo e duplica a tarefa. _Correção:_ Envolver tocarProjeto em try/catch nessas funções e não propagar o erro (no máximo logar sem dados pessoais), já que a tarefa foi gravada.
- **js/app.js**: Depois de Sair, o markup do resumo, do projeto e dos responsáveis fica no DOM, só escondido. Os nomes continuam visíveis no devtools em máquina compartilhada. _Correção:_ No handler de SIGNED_OUT e no btn-sair, chamar replaceChildren() em #tela-resumo, #tela-projeto e #tela-responsaveis e zerar linhas = [].
- **js/app.js**: Link de recuperação expirado (hash com error_description) é descartado em silêncio após 1,5 s. O gestor cai no login sem saber o motivo. _Correção:_ No fallback de iniciar, se o hash tiver error_description, montar o login e escrever em #login-msg: 'Link expirado. Peça um novo em Esqueci minha senha.'
- **js/tela-projeto.js**: Em 'Sessão expirada', as telas só trocam o hash para #login, mas app.js ainda tem sessao preenchida. Isso gera um desvio extra por #resumo antes de chegar ao login. _Correção:_ Expor de app.js um callback de sessão expirada (ou chamar sair() de supabase.js) para zerar a sessão antes de navegar ao login.
- **js/app.js**: O auth.users é compartilhado. Qualquer usuário de outro app do projeto consegue entrar e usar o painel com dados próprios. Não há vazamento (RLS isola por dono), mas foge do 'único usuário' do PRD. _Correção:_ Na v2, criar a tabela sq_gestor_do_mato_07ca_membros e checar a pertença no login e nas políticas. Por ora, deixar documentado como risco aceito.

## Roteiro de teste manual

- [ ] RF1: com a chave publishable, consultar as 3 tabelas sem sessão e confirmar retorno vazio (RLS).
- [ ] RF2: responsável com 3 tarefas; excluir e ver as 3 como Sem responsável e o projeto como Incompleto.
- [ ] RF6: duas tarefas pendentes na mesma data; a próxima no resumo deve ser a cadastrada primeiro.
- [ ] RF7: próxima tarefa no estágio Revisão faz o projeto aparecer em Revisão.
- [ ] RF8: tarefa prevista 29/10/2026 aparece atrasada às 00:01 de 30/10/2026 (Brasília); concluída antes da data aparece Adiantada.
- [ ] RF9: projeto previsto 30/11/2026 com última conclusão em 20/11/2026 vira Adiantado e sai da visão padrão.
- [ ] RF10: conferir atrasados no topo e projetos sem tarefas no fim.
- [ ] RF13: Imprimir em A4, sem menus, com Gerado em dd/mm/aaaa hh:mm.
- [ ] RF14: exportar com filtro Atrasado, abrir no Excel, conferir 6 colunas, acentos e datas dd/mm/aaaa.
- [ ] RF16: concluir tarefa às 14:30 e ver Atualizado em com esse horário; projeto parado há 8 dias destacado em amarelo.
- [ ] Responsivo em 360 px (cartões) e navegação por teclado.
- [ ] Recuperação de senha pelo e-mail recebido.
- [ ] Limpar no banco os projetos de teste com o marcador da rodada (não há exclusão de projeto na interface).

## Revisão de integração (Eduardo)

- **js/tela-resumo.js**: Nos filtros Atrasado e No prazo, renderResumo recalcula ultimoIncompletos só com as linhas filtradas, pois lista.some(ativo) é true. O indicador do topo (RF12, meta de 100%) passa a contar só os incompletos daquela visão e sobrescreve o total de ativos que app.js garantiu no primeiro desenho. _Correção:_ Atualizar o contador só na visão padrão: if (filtroAtual === 'ativos') ultimoIncompletos = contarIncompletos(lista); e remover o ramo com lista.some. app.js já desenha 'ativos' antes do filtro atual no carregamento, então nos filtros parciais e em Concluídos o valor guardado é o total correto.
- **js/app.js**: No login, o submit chama navegar('#resumo') e o evento SIGNED_IN (adiado por setTimeout) também chama. Se o evento chegar primeiro, o hash já é '#resumo' e navegar força rotear() de novo. Resultado: carregarResumo roda duas vezes em paralelo (4 consultas e dois renders). Não quebra, mas pode piscar a tela e gastar a meta de 2 s. _Correção:_ No submit, depois de entrar(), só guardar sessao = await obterSessao() e chamar navegar('#resumo') se location.hash ainda for '#login'. Ou deixar a navegação só no handler de SIGNED_IN. Outra saída é um guard em carregarResumo com um contador de requisição, que descarta o render antigo.

## Verificação automática final

Imports, referências do HTML, contratos de export, caminhos relativos e padrões inseguros.

- Sem alertas.
