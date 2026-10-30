# PRD · Cadastro de Alunos

Owner: Rodrigo Silva · Versão 1.1 · Data: 30/10/2026

## 1. Resumo executivo
Aplicação web estática para um professor registrar alunos (nome e email), listar, pesquisar e exportar em CSV.
Acesso restrito ao professor via login do Supabase, com dados protegidos por RLS.
MVP focado em rapidez: cadastro em menos de 30 segundos e busca com resultado em até 1 segundo.

## 2. Contexto e problema
O professor precisa manter a lista dos seus alunos e contatá-los por email. Quer um lugar único e privado, acessado só por ele, para guardar nome e email, achar um aluno em poucos segundos e exportar a lista em CSV.

## 3. Usuários e jobs to be done
| Usuário | Job to be done |
|---|---|
| Professor (usuário único) | Quando tenho um aluno novo, quero registrá-lo em segundos para não perder o contato. |
| Professor | Quando preciso falar com um aluno, quero achá-lo pelo nome ou email e abrir um email para ele. |
| Professor | Quando preciso usar a lista em outra ferramenta, quero exportá-la em CSV. |

## 4. Objetivos e não objetivos
**Objetivos**
- Cadastrar, editar e excluir alunos com nome e email.
- Listar e pesquisar alunos por nome ou email.
- Abrir contato por email via link mailto.
- Exportar a lista (inteira ou filtrada) em CSV.

**Não objetivos**
- Múltiplos usuários, perfis ou compartilhamento de lista.
- Cadastro público de contas (auto registro).
- Campos extras (turma, curso, telefone, notas).
- Envio automático de email ou WhatsApp (exige segredo no servidor; usamos mailto).
- Backend próprio, app mobile nativo ou desktop.
- Importação de CSV e lixeira/recuperação de excluídos.

## 5. Métricas de sucesso
| Métrica | Meta | Como medir |
|---|---|---|
| Tempo para cadastrar um aluno | < 30 segundos | Teste cronometrado pelo professor, do clique em "Novo aluno" à confirmação |
| Tempo de resposta da busca | ≤ 1 segundo com 300 registros | Teste cronometrado com base de 300 alunos |
| Duplicidade de email | 0 emails duplicados | Consulta na tabela após o teste |
| CSV abre corretamente | Acentos legíveis no Excel e Google Sheets | Abertura manual do arquivo exportado |

## 6. Requisitos funcionais
- **RF1 · Login:** o app exige login por email e senha (Supabase Auth) antes de exibir qualquer dado. Não há tela de cadastro de conta. Há botão "Sair".
- **RF2 · Tela de lista:** após o login, a tela "Alunos" mostra todos os alunos do professor em ordem alfabética por nome, com nome, email e ações (Contatar, Editar, Excluir), além do total exibido (ex.: "42 alunos").
- **RF3 · Cadastrar:** botão "Novo aluno" abre formulário com Nome e Email. Nome obrigatório, 2 a 120 caracteres após remover espaços nas pontas. Email em formato válido, convertido para minúsculas e sem espaços. Ao salvar, o aluno aparece na lista e o formulário limpa, com foco no campo Nome para cadastrar o próximo.
- **RF4 · Email único:** se o email já existir para o professor, o salvamento é bloqueado com a mensagem "Já existe um aluno com este email". A regra vale no front e no banco (restrição única por user_id + email).
- **RF5 · Editar:** "Editar" abre o formulário preenchido, com as mesmas validações de RF3 e RF4. Salvar atualiza a lista; Cancelar descarta mudanças.
- **RF6 · Excluir:** "Excluir" pede confirmação ("Excluir <nome> definitivamente?"). Confirmado, o registro é apagado do banco de forma definitiva.
- **RF7 · Busca:** campo "Pesquisar" filtra a lista enquanto o professor digita, por trecho do nome ou do email, sem diferenciar maiúsculas e minúsculas e ignorando acentos no nome. Sem resultados: "Nenhum aluno encontrado". Limpar o campo volta a lista completa.
- **RF8 · Contato:** "Contatar" abre o cliente de email padrão via link mailto:<email do aluno>.
- **RF9 · Exportar CSV:** botão "Exportar CSV" baixa arquivo UTF-8 com BOM, separador vírgula, cabeçalho "nome,email", contendo a lista filtrada se houver busca ativa, ou a lista inteira. Nome do arquivo: alunos-AAAA-MM-DD.csv. Valores com vírgula ou aspas são escapados.
- **RF10 · Carregamento e erro:** durante carregar, salvar ou excluir, o botão acionado fica desabilitado e mostra "Carregando...". Em falha de rede ao salvar, exibe "Não foi possível salvar. Verifique sua conexão" e mantém os dados digitados no formulário. Em falha ao excluir ou carregar, exibe "Não foi possível concluir. Verifique sua conexão". Se a sessão expirou, qualquer ação leva à tela de login com a mensagem "Sua sessão expirou. Entre novamente".

## 7. Requisitos não funcionais
- **Stack:** HTML, CSS e JavaScript (ES modules), sem build, publicado no GitHub Pages. supabase-js via CDN com versão fixa.
- **Segurança:** tabela alunos com RLS ativada; políticas de select, insert, update e delete só para auth.uid() = user_id. Apenas a chave publishable no front, nenhum segredo. Cadastro público desativado no Supabase Auth; conta do professor criada manualmente.
- **LGPD:** dados pessoais (nome, email) usados só para contato acadêmico. Exclusão definitiva atende pedido do titular. Texto curto na tela informa a finalidade. Sem rastreadores ou analytics de terceiros.
- **Desempenho:** lista de até 300 alunos carregada uma vez; busca feita no navegador com resposta ≤ 1 segundo.
- **Acessibilidade:** campos com label, navegação completa por teclado, foco visível, mensagens de erro associadas ao campo e anunciadas (aria-live), contraste AA.
- **Responsivo:** utilizável de 360 px (celular) a desktop, sem rolagem horizontal.

## 8. Critérios de aceite
- **RF1:** Dado que não estou logado, Quando abro o app, Então vejo só a tela de login. Dado credenciais erradas, Quando tento entrar, Então vejo "Email ou senha inválidos".
- **RF2:** Dado que estou logado com alunos cadastrados, Quando abro a tela Alunos, Então vejo todos em ordem alfabética e o total correto.
- **RF3:** Dado o formulário de novo aluno, Quando informo "Maria Souza" e " Maria@Escola.com ", Então o aluno é salvo com email "maria@escola.com" e aparece na lista. Dado nome com 1 caractere ou email inválido, Quando salvo, Então vejo a mensagem de erro no campo e nada é gravado.
- **RF4:** Dado que maria@escola.com já existe, Quando cadastro ou edito outro aluno com MARIA@escola.com, Então o salvamento é bloqueado com "Já existe um aluno com este email".
- **RF5:** Dado um aluno existente, Quando altero o nome e salvo, Então a lista mostra o novo nome após recarregar a página.
- **RF6:** Dado um aluno, Quando clico Excluir e cancelo, Então nada muda. Quando confirmo, Então ele some da lista e não volta após recarregar.
- **RF7:** Dado 300 alunos, Quando digito "joao", Então vejo em até 1 segundo os alunos com "João" no nome ou "joao" no email. Dado um termo inexistente, Então vejo "Nenhum aluno encontrado".
- **RF8:** Dado um aluno, Quando clico Contatar, Então o cliente de email abre com o email dele no destinatário.
- **RF9:** Dado uma busca ativa, Quando clico Exportar CSV, Então baixo alunos-AAAA-MM-DD.csv só com os filtrados, e acentos aparecem corretos no Excel.
- **RF10:** Dado que estou sem rede, Quando salvo um aluno, Então vejo "Não foi possível salvar. Verifique sua conexão", nada é gravado e o formulário mantém o que digitei. Dado que minha sessão expirou, Quando faço qualquer ação, Então volto à tela de login com "Sua sessão expirou. Entre novamente". Dado um salvamento em andamento, Quando olho o botão Salvar, Então ele está desabilitado com "Carregando...".
- **Segurança:** Dado outro usuário autenticado no mesmo projeto, Quando consulta a tabela alunos, Então não recebe nenhum registro do professor.

## 9. Premissas assumidas
- Usuário único (o professor), conta criada manualmente no Supabase do SquadTech, cadastro público desativado.
- Dados isolados por user_id via RLS.
- Nome 2 a 120 caracteres; email validado, minúsculo e sem espaços; email único por professor.
- Exclusão definitiva, sem lixeira.
- Busca parcial por nome ou email, sem diferenciar maiúsculas e ignorando acentos no nome, feita no navegador.
- Contato só por mailto.
- CSV UTF-8 com BOM, colunas nome e email, inteiro ou filtrado.
- Volume até 300 alunos (sem paginação).
- Recuperação de senha pelo fluxo padrão do Supabase, se necessário, sem tela própria no MVP.

## 10. Riscos e dependências
- **Dependência:** projeto Supabase do SquadTech disponível e conta do professor criada antes da entrega.
- **Risco:** RLS mal configurada expor dados. Mitigação: teste de acesso com segundo usuário (critério de segurança).
- **Risco:** exclusão acidental definitiva. Mitigação: confirmação com nome do aluno; exportar CSV periodicamente como backup.
- **Risco:** volume crescer bem acima de 300. Mitigação: revisar para busca e paginação no servidor.
- **Risco:** mailto depender de cliente de email configurado no dispositivo. Mitigação: email visível e copiável na lista.

## 11. Fora desta versão (backlog futuro)
- Campos extras (turma, curso, telefone, observações).
- Importação de CSV.
- Lixeira com restauração.
- Envio de email em massa (mailto com cópia oculta para os filtrados) ou integração de envio automático, que exigiria backend.
- Múltiplos professores ou secretaria com permissões.
- PWA para uso offline.