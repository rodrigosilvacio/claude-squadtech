# Cadastro de Alunos

App web para o professor guardar nome e email dos seus alunos, num lugar privado e só dele.
Permite cadastrar, editar, excluir, pesquisar (ignorando acentos) e abrir um email com um clique.
Exporta a lista inteira ou filtrada em CSV, pronta para Excel e Google Sheets.

**Acesso:** https://rodrigosilvacio.github.io/claude-squadtech/projetos/cadastro-de-alunos/

## Como entrar

- Use a mesma conta do SquadTech: o email e a senha do Supabase do Rodrigo.
- Não existe tela de criar conta (cadastro público desativado, por decisão do PRD).
- **Esqueci minha senha:** na tela de login, informe o email e clique em "Esqueci minha senha". Chega um link por email; ao abri-lo, o app mostra o campo de nova senha. Digite e confirme.
- **Pré-requisito da recuperação:** a URL do app precisa estar nas Redirect URLs do Supabase Auth (Authentication > URL Configuration). Sem isso, o link cai em outro app.
- **Outra pessoa precisa de conta?** Crie manualmente no painel do Supabase (Authentication > Users > Add user, com email e senha). Cada conta vê só os próprios alunos (RLS por user_id). O app foi pensado para um professor só; uso por secretaria ou vários professores com lista compartilhada é fase futura.

## Como usar (perfil: professor)

1. Entre com email e senha.
2. **Cadastrar:** clique em "Novo aluno", preencha Nome (2 a 120 caracteres) e Email, clique em Salvar. O formulário limpa e volta ao Nome, para cadastrar o próximo. O email é salvo em minúsculas e sem espaços.
3. **Email repetido:** se já existir, aparece "Já existe um aluno com este email" e nada é gravado.
4. **Pesquisar:** digite parte do nome ou do email em "Pesquisar". "joao" acha "João". Limpe o campo para ver todos.
5. **Contatar:** clique em Contatar para abrir seu cliente de email já com o destinatário. O email também fica visível na lista para copiar.
6. **Editar:** clique em Editar, altere e Salve (ou Cancele).
7. **Excluir:** clique em Excluir e confirme. A exclusão é definitiva.
8. **Exportar CSV:** clique em "Exportar CSV". Baixa alunos-AAAA-MM-DD.csv com a lista filtrada (se houver busca) ou completa.
9. **Sair:** botão Sair no topo.

## Situação dos testes

- **8 de 8 testes automáticos passando** no navegador (login inválido, cadastro com email normalizado, validações, duplicidade, edição, busca sem acento, busca vazia e total).
- Detalhes em docs/RELATORIO-TESTES.md.

### Roteiro de teste manual

- [ ] Ordem alfabética e total correto com vários alunos.
- [ ] Editar, recarregar a página e ver o novo nome.
- [ ] Excluir e cancelar: nada muda. Excluir e recarregar: não volta.
- [ ] Com 300 alunos, buscar "joao" e ver resultado em até 1 segundo.
- [ ] Contatar abre o email com o destinatário certo.
- [ ] Com busca ativa, exportar e abrir no Excel e no Sheets: só os filtrados, acentos corretos.
- [ ] Sem rede, salvar: ver "Não foi possível salvar. Verifique sua conexão" e os dados mantidos. Botão Salvar mostra "Carregando..." durante o envio.
- [ ] Apagar o token da sessão e agir: voltar ao login com "Sua sessão expirou. Entre novamente".
- [ ] Logar com outro usuário do projeto: não ver nenhum aluno do professor.
- [ ] Recuperação de senha completa (pedir link, abrir, definir nova senha).
- [ ] Celular de 360 px e navegação só por teclado, com foco visível.
- [ ] Limpeza: apagar os alunos "Dup" e "Editado" criados pelos testes automáticos.

## Onde ficam os dados e LGPD

- Tabela sq_cadastro_de_al_d0f3_alunos no Supabase do SquadTech (nome, email, datas).
- RLS ativada: cada usuário lê e altera só as próprias linhas. Sem acesso anônimo.
- No navegador fica só a chave publishable; nenhum segredo.
- Finalidade: contato acadêmico (texto informado na tela). Sem analytics nem rastreadores.
- Pedido de exclusão do titular: basta excluir o aluno; a remoção é definitiva.
- Não existe backup automático: exporte o CSV periodicamente.

## Limitações e pendências conhecidas

Nenhum teste falhou, mas a revisão de código apontou melhorias ainda não aplicadas:

- **Login sem rede** mostra "Email ou senha inválidos" em vez de avisar falha de conexão.
- **Sessão que expira sozinha** (falha no refresh do token) volta ao login sem a mensagem "Sua sessão expirou".
- **Aviso de falha ao salvar** aparece fora do formulário aberto; pode ficar pouco visível e não ser lido pelo leitor de tela.
- **Excluir um aluno já apagado em outra aba** pode deslogar o professor sem necessidade.
- **Link de recuperação inválido ou já usado** pode deixar a tela em branco; nesse caso, recarregue o app sem o trecho após # e peça novo link.
- **CSV:** nomes que começam com =, +, - ou @ podem virar fórmula no Excel (CSV injection). Risco baixo, já que só o professor digita os dados.
- **Contatar:** emails com caracteres incomuns (? ou &) podem gerar link mailto incorreto.
- **Acessibilidade:** o total de alunos é anunciado a cada tecla na busca, deixando o leitor de tela ruidoso.
- Contato só por mailto (depende de cliente de email configurado no aparelho).
- Pensado para até 300 alunos, sem paginação.

## Fica para depois

- Campos extras (turma, curso, telefone, observações).
- Importação de CSV.
- Lixeira com restauração.
- Email em massa (mailto com cópia oculta) ou envio automático (exige backend).
- Vários professores ou secretaria com permissões.
- PWA para uso offline.

## Estrutura da pasta

```
cadastro-de-alunos/
├── index.html          telas e formulário
├── css/estilo.css      estilo responsivo e acessível
├── js/
│   ├── app.js          integração, telas e mensagens
│   ├── auth.js         login, sair e recuperação de senha
│   ├── alunos.js       CRUD no Supabase
│   ├── supabase.js     cliente Supabase
│   ├── config.js       URL e chave publishable
│   ├── validacao.js    validação de nome e email
│   ├── csv.js          exportação CSV
│   ├── ui-lista.js     lista, busca e contato
│   └── ui-form.js      formulário de aluno
└── docs/
    ├── PRD.md
    ├── ARQUITETURA.md
    └── RELATORIO-TESTES.md
```
