# Relatório de testes · Cadastro de Alunos

**Situação:** 8 de 8 testes automáticos passando no navegador, em 1 rodada de QA.

## Testes automáticos no navegador (Igor)

| Teste | Resultado |
|---|---|
| C1 · index.html carrega sem erros | passou |
| T1 · Login com credenciais erradas | passou |
| T2 · Cadastro normaliza email e some ao excluir | passou |
| T3 · Validação de nome curto e email inválido | passou |
| T4 · Email duplicado com caixa diferente | passou |
| T5 · Editar nome do aluno | passou |
| T6 · Busca ignora acento e exclui | passou |
| T7 · Busca sem resultado e total visível | passou |

## Pendências

- Nenhuma.

## Correções feitas pelo QA

- Nenhuma.

## Revisão de código e segurança (Júlia): melhorias sugeridas

- **js/auth.js**: entrar() transforma qualquer falha em 'Email ou senha inválidos', inclusive falta de rede ou erro 5xx. Sem conexão, o professor acha que errou a senha. _Correção:_ No catch, se error.status for 400 (ou a mensagem for 'Invalid login credentials'), lançar 'Email ou senha inválidos'. Se for TypeError, sem status ou navigator.onLine === false, lançar 'Não foi possível concluir. Verifique sua conexão'.
- **index.html**: #total-alunos tem aria-live=polite e muda a cada tecla digitada na busca. O leitor de tela anuncia o total repetidamente e fica ruidoso. _Correção:_ Remover aria-live do #total-alunos. Se quiser anunciar o resultado da busca, atualizar uma região sr-only com debounce de uns 500 ms.
- **js/csv.js**: escapar() não neutraliza valores que começam com =, +, - ou @. Um nome como '=HYPERLINK(...)' vira fórmula ao abrir o CSV no Excel ou no Sheets (CSV injection). _Correção:_ Em escapar(), se o texto começar com =, +, -, @, tab ou CR, prefixar com apóstrofo (') antes de aplicar as aspas.
- **js/ui-lista.js**: O href do Contatar é montado com 'mailto:' + email sem codificação. Caracteres como ? ou & aceitos pela regex podem virar parâmetros do mailto. _Correção:_ Usar contatar.href = 'mailto:' + encodeURIComponent(email).replace('%40', '@'), ou aplicar encodeURI(email).

## Roteiro de teste manual

- [ ] RF2: conferir ordem alfabética e total correto com vários alunos.
- [ ] RF5: após editar, recarregar a página e ver o novo nome persistido.
- [ ] RF6: clicar Excluir e cancelar o confirm; nada muda. Excluir e recarregar; não volta.
- [ ] RF7: com 300 alunos, cronometrar busca por 'joao' (até 1 s).
- [ ] RF8: clicar Contatar e ver o cliente de email com o destinatário certo.
- [ ] RF9: com busca ativa, exportar e abrir alunos-AAAA-MM-DD.csv no Excel e Sheets; só filtrados e acentos corretos.
- [ ] RF10: sem rede, salvar; ver 'Não foi possível salvar. Verifique sua conexão' e dados mantidos. Ver botão Salvar com 'Carregando...' durante o envio.
- [ ] RF10: expirar a sessão (apagar token) e agir; voltar ao login com 'Sua sessão expirou. Entre novamente'.
- [ ] Segurança: logar com outro usuário do projeto e consultar a tabela; nenhum registro do professor.
- [ ] Recuperação de senha: pedir link, abrir email, definir nova senha.
- [ ] Limpeza: apagar os alunos 'Dup' e 'Editado' criados nos testes T4 e T5.
- [ ] Responsivo em 360 px e navegação por teclado com foco visível.

## Revisão de integração (Eduardo)

- **js/app.js**: Se o refresh do token falha, o supabase-js emite SIGNED_OUT sozinho e o handler chama mostrarLogin() sem texto. O professor cai no login sem 'Sua sessão expirou. Entre novamente', o que contraria o RF10. _Correção:_ Criar a flag interna saindoPeloUsuario, ligada em aoSair antes de sair(). No SIGNED_OUT, chamar mostrarLogin(saindoPeloUsuario ? '' : MSG.sessao) e depois zerar a flag.
- **js/app.js**: Na falha de rede ao salvar, a mensagem vai para #mensagem, que fica fora do dialog modal. Com showModal, esse conteúdo fica inerte e atrás do backdrop: o leitor de tela pode não anunciar e o professor mal vê o aviso. _Correção:_ Manter o texto em #mensagem (contrato e Sala de Testes) e também exibir o mesmo texto dentro do dialog, por exemplo num p com aria-live dentro do form. Outra opção é mover #mensagem para dentro do dialog enquanto ele estiver aberto.
- **js/alunos.js**: excluirAluno lança ErroSessao quando o delete afeta 0 linhas. Se o aluno já tiver sido apagado em outra aba, o app desloga o professor sem motivo real. _Correção:_ Lançar ErroRede nesse caso, ou tratar 0 linhas como sucesso. Deixar a sessão inválida para garantirSessao e os códigos 401/PGRST301, que já cobrem esse cenário.
- **js/app.js**: Em iniciar(), quando o hash tem type=recovery mas não há sessão (token inválido ou já usado) e PASSWORD_RECOVERY não chega, nenhuma tela é exibida. As duas sections ficam hidden e a tela fica em branco. _Correção:_ No ramo modoRecuperacao sem sessão, chamar mostrarLogin('Link de recuperação inválido ou expirado. Peça um novo') e limpar o hash com history.replaceState.

## Verificação automática final

Imports, referências do HTML, contratos de export, caminhos relativos e padrões inseguros.

- Sem alertas.
