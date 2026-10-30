# Arquitetura · Cadastro de Alunos

**Versão:** 1 · **Proposta:** Carla · **Revisão:** Diego

# Arquitetura · Cadastro de Alunos

## Stack
- HTML, CSS e JavaScript (ES modules), sem build, no GitHub Pages, só caminhos relativos.
- supabase-js 2.110.5 via CDN (jsdelivr +esm), cliente com auth.storageKey 'sq_cadastro_de_al_d0f3_auth'.
- Supabase Auth com email e senha. Uma tabela: sq_cadastro_de_al_d0f3_alunos.

## Telas e fluxos
1. **Login** (#tela-login): Entrar e "Esqueci minha senha". Credencial errada: "Email ou senha inválidos". Sem cadastro de conta.
2. **Recuperação**: resetPasswordForEmail com redirectTo = location.origin + location.pathname (sem hash nem query). No evento PASSWORD_RECOVERY aparece #form-nova-senha, que chama updateUser.
3. **Alunos** (#tela-alunos): texto de finalidade (LGPD), Sair, Pesquisar, Novo aluno, Exportar CSV, total e lista. Cada linha: email visível, Contatar (mailto), Editar, Excluir.
4. **Formulário** (dialog #form-aluno): Nome, Email, Salvar, Cancelar. Serve para criar e editar; após criar, limpa e foca Nome.
5. **Excluir**: confirm("Excluir <nome> definitivamente?").

Fluxo: verifica sessão, mostra login ou alunos. A lista é carregada uma vez e fica em memória; busca e CSV usam essa cópia. Salvar e excluir atualizam o banco e depois a cópia local.

## Ids estáveis (contrato entre index.html, módulos de UI e Sala de Testes)
tela-login, login-email, login-senha, btn-entrar, erro-login, link-esqueci, form-nova-senha, nova-senha, btn-nova-senha, tela-alunos, btn-sair, campo-busca, btn-novo, btn-exportar, total-alunos, lista-alunos, lista-vazia, form-aluno, campo-nome, campo-email, erro-nome, erro-email, btn-salvar, btn-cancelar, mensagem. Botões por linha usam classes (btn-contatar, btn-editar, btn-excluir) com data-id do aluno.

## Onde mora cada RF
- RF1: auth.js e app.js
- RF2, RF7, RF8: ui-lista.js
- RF3, RF4, RF5: ui-form.js, validacao.js, alunos.js (RF4 também no banco)
- RF6: ui-lista.js e alunos.js
- RF9: csv.js
- RF10: app.js, com erros tipados de alunos.js

## Decisões e trade-offs
- **Ordenação no cliente.** renderizarLista sempre ordena por a.nome.localeCompare(b.nome, 'pt-BR', {sensitivity: 'base'}), garantindo RF2 após inserir ou editar e evitando diferença de collation do banco.
- **Busca no cliente.** normalize('NFD'), remove diacríticos, compara em minúsculas. Instantânea com 300 registros.
- **Email único.** Front checa a lista em memória (ignorando o próprio id); banco tem unique (user_id, email). Erro 23505 vira "Já existe um aluno com este email".
- **Sessão expirada.** 401/JWT viram ErroSessao; app.js faz signOut e mostra login com "Sua sessão expirou. Entre novamente".
- **Falha de rede.** ErroRede; o formulário fica aberto com os dados.
- **Estados e mensagens.** comBotaoCarregando e mostrarMensagem são internos ao app.js (sem export). Módulos de UI só recebem callbacks, sem import circular.
- **CSV.** BOM, vírgula, cabeçalho nome,email, aspas duplicadas no escape, download via Blob e a[download].

## Segurança e LGPD
- RLS com políticas por operação, só authenticated, user_id = (select auth.uid()). Sem anon. user_id default auth.uid().
- Só chave publishable. Cadastro público desativado; conta do professor criada manualmente.
- Sem analytics. Texto de finalidade na tela. Exclusão definitiva atende o titular.
- Acessibilidade: labels, aria-live em #mensagem, aria-describedby nos erros, foco visível, contraste AA, responsivo a partir de 360 px.

## Riscos e dependências
- Cadastrar https://rodrigosilvacio.github.io/claude-squadtech/projetos/<slug>/ nas Redirect URLs do Supabase Auth; sem isso o link de recuperação cai na Site URL de outro app.
- Conta do professor criada antes da entrega.

## Arquivos

| Arquivo | Responsabilidade | Exporta |
|---|---|---|
| `index.html` | Estrutura das telas (login, recuperação, nova senha, alunos), dialog do formulário e região aria-live #mensagem, com exatamente os ids definidos na visão geral. Carrega ./css/estilo.css e ./js/app.js como module. | - |
| `css/estilo.css` | Estilo responsivo de 360 px a desktop, foco visível, contraste AA, estados de erro e botão desabilitado. | - |
| `js/supabase.js` | Cria o cliente Supabase (CDN 2.110.5) com SUPABASE_URL e SUPABASE_CHAVE de ./config.js e storageKey 'sq_cadastro_de_al_d0f3_auth'. | `supabase: SupabaseClient` |
| `js/auth.js` | Login, logout, sessão e recuperação de senha com redirectTo = location.origin + location.pathname. | `entrar(email: string, senha: string): Promise<void> (lança Error('Email ou senha inválidos'))`<br>`sair(): Promise<void>`<br>`obterSessao(): Promise<Session\|null>`<br>`enviarRecuperacao(email: string): Promise<void>`<br>`definirNovaSenha(senha: string): Promise<void>`<br>`aoMudarAuth(cb: (evento: string, sessao: Session\|null) => void): void` |
| `js/alunos.js` | CRUD na tabela sq_cadastro_de_al_d0f3_alunos; mapeia 23505 para ErroDuplicado, 401/JWT para ErroSessao e falha de rede para ErroRede. | `class ErroSessao extends Error`<br>`class ErroDuplicado extends Error`<br>`class ErroRede extends Error`<br>`listarAlunos(): Promise<Aluno[]>`<br>`criarAluno(dados: {nome: string, email: string}): Promise<Aluno>`<br>`atualizarAluno(id: string, dados: {nome: string, email: string}): Promise<Aluno>`<br>`excluirAluno(id: string): Promise<void>` |
| `js/validacao.js` | Normalização e validação puras de nome e email, e normalização de texto para busca. | `normalizarNome(nome: string): string`<br>`normalizarEmail(email: string): string`<br>`validarAluno(dados: {nome: string, email: string}, existentes: Aluno[], idAtual?: string): {ok: boolean, erros: {nome?: string, email?: string}, dados: {nome: string, email: string}}`<br>`semAcento(texto: string): string` |
| `js/csv.js` | Geração e download do CSV UTF-8 com BOM, escape e nome alunos-AAAA-MM-DD.csv. | `gerarCsv(alunos: Aluno[]): string`<br>`baixarCsv(alunos: Aluno[], data?: Date): void` |
| `js/ui-lista.js` | Filtra por termo (sem acento), ordena com localeCompare pt-BR sensitivity base, renderiza #lista-alunos, #total-alunos e #lista-vazia ('Nenhum aluno encontrado'), link mailto e callbacks Editar/Excluir. | `filtrarAlunos(alunos: Aluno[], termo: string): Aluno[]`<br>`ordenarAlunos(alunos: Aluno[]): Aluno[]`<br>`renderizarLista(alunos: Aluno[], acoes: {onEditar: (a: Aluno) => void, onExcluir: (a: Aluno) => void}): void` |
| `js/ui-form.js` | Dialog #form-aluno: abrir novo ou edição, ler valores, erros por campo em #erro-nome/#erro-email, limpar e focar #campo-nome. Não importa app.js. | `abrirFormulario(aluno?: Aluno): void`<br>`fecharFormulario(): void`<br>`lerFormulario(): {nome: string, email: string}`<br>`mostrarErros(erros: {nome?: string, email?: string}): void`<br>`limparFormulario(): void`<br>`alunoEmEdicao(): Aluno\|null` |
| `js/app.js` | Ponto de entrada e integração: troca de telas, estado em memória, eventos, helpers internos comBotaoCarregando e mostrarMensagem (sem export), mensagens do RF10, sessão expirada e PASSWORD_RECOVERY. Chama iniciar() ao carregar. | - |

## Modelo de dados

Tabela public.sq_cadastro_de_al_d0f3_alunos

Colunas:
- id: uuid, chave primária, default gen_random_uuid().
- user_id: uuid, não nulo, default auth.uid(), FK para auth.users(id) on delete cascade.
- nome: text, não nulo. Check: char_length(btrim(nome)) entre 2 e 120.
- email: text, não nulo. Checks: email = lower(email); email sem espaços (email !~ '\s'); formato básico com regex '^[^@\s]+@[^@\s]+\.[^@\s]+\Z' (âncora final \Z, nunca o cifrão, que o executor bloqueia).
- criado_em: timestamptz, não nulo, default now().
- atualizado_em: timestamptz, não nulo, default now(). O front envia o valor ao editar.

Índices:
- Único sq_cadastro_de_al_d0f3_alunos_user_email_uq em (user_id, email).

RLS ativada, quatro políticas para authenticated:
- select: using user_id = (select auth.uid()).
- insert: with check user_id = (select auth.uid()).
- update: using e with check user_id = (select auth.uid()).
- delete: using user_id = (select auth.uid()).

O papel anon não tem acesso. Cada professor lê e escreve só as próprias linhas.

Prefixo das tabelas: `sq_cadastro_de_al_d0f3_`

```sql
create table public.sq_cadastro_de_al_d0f3_alunos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome text not null check (char_length(btrim(nome)) between 2 and 120),
  email text not null check (email = lower(email) and email !~ '\s' and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+\Z'),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create unique index sq_cadastro_de_al_d0f3_alunos_user_email_uq on public.sq_cadastro_de_al_d0f3_alunos (user_id, email);

alter table public.sq_cadastro_de_al_d0f3_alunos enable row level security;

create policy sq_cadastro_de_al_d0f3_alunos_select on public.sq_cadastro_de_al_d0f3_alunos for select to authenticated using (user_id = (select auth.uid()));

create policy sq_cadastro_de_al_d0f3_alunos_insert on public.sq_cadastro_de_al_d0f3_alunos for insert to authenticated with check (user_id = (select auth.uid()));

create policy sq_cadastro_de_al_d0f3_alunos_update on public.sq_cadastro_de_al_d0f3_alunos for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy sq_cadastro_de_al_d0f3_alunos_delete on public.sq_cadastro_de_al_d0f3_alunos for delete to authenticated using (user_id = (select auth.uid()));

comment on table public.sq_cadastro_de_al_d0f3_alunos is 'Alunos do professor, usados só para contato acadêmico.';
```

Este SQL só é aplicado depois da sua aprovação, pelo executor seguro: só tabelas com o prefixo do projeto, RLS obrigatório, sem funções, sem DROP e sem GRANT.

## Plano de tarefas

| # | Tarefa | Dev | Arquivos |
|---|---|---|---|
| 1 | **Integração e estrutura**<br>index.html com a tabela de ids da arquitetura e app.js ligando auth, CRUD, lista, formulário e CSV. Helpers comBotaoCarregando e mostrarMensagem internos, RF10, sessão expirada e PASSWORD_RECOVERY. | Eduardo | `index.html`<br>`js/app.js` |
| 2 | **Supabase, auth e dados**<br>Cliente com storageKey, auth.js com recuperação (redirectTo = origin + pathname) e alunos.js com erros tipados (23505, 401/JWT, rede). | Fernanda | `js/supabase.js`<br>`js/auth.js`<br>`js/alunos.js` |
| 3 | **Validação e CSV**<br>Funções puras de RF3 e RF4 no front e CSV do RF9: BOM, escape e nome com data. | Gabriel | `js/validacao.js`<br>`js/csv.js` |
| 4 | **Interface: lista, formulário e estilo**<br>Lista acessível com ordenação localeCompare pt-BR, busca sem acento e mailto; dialog com erros por campo (aria-describedby) usando os ids definidos; CSS responsivo AA. Sem importar app.js. | Helena | `js/ui-lista.js`<br>`js/ui-form.js`<br>`css/estilo.css` |
