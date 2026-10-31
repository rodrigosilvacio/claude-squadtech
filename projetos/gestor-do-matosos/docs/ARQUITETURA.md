# Arquitetura · Gestor do MatosOS

**Versão:** 1 · **Proposta:** Carla · **Revisão:** Diego

## Stack
- HTML, CSS e JS (ES modules) sem build, no GitHub Pages, só caminhos relativos.
- Supabase (Postgres com RLS e Auth por e-mail e senha) via supabase-js@2.110.5 no jsDelivr, chave publishable de ./config.js, storageKey 'sq_gestor_do_mato_07ca_auth'.

## Telas e fluxos
SPA com hash routing. O index.html tem só um container por tela; cada módulo monta o próprio markup com os ids fixados abaixo (contrato para a Sala de Testes e para a integração).
1. **Login** (#login, container #tela-login, montado por app.js): #login-email, #login-senha, #btn-entrar, #btn-esqueci, #login-msg. Recuperação: #form-nova-senha, #nova-senha, #btn-salvar-senha, #nova-senha-msg (RF1).
2. **Resumo** (#resumo, #tela-resumo): #resumo-indicador, #resumo-filtro (select: ativos, atrasado, no_prazo, concluidos), #btn-novo-projeto, #btn-imprimir, #btn-exportar-csv, #resumo-lista (tabela no desktop, cartões abaixo de 640 px), linhas com id resumo-projeto-{id}, #resumo-gerado-em (data de geração na impressão), #resumo-vazio (RF10 a RF14, RF16).
3. **Detalhe** (#projeto/ID ou #projeto/novo, #tela-projeto): #form-projeto, #projeto-nome, #projeto-data-prevista, #projeto-observacao, #btn-salvar-projeto, #erro-projeto, #btn-voltar; #form-tarefa, #tarefa-titulo, #tarefa-estagio, #tarefa-responsavel, #tarefa-data-prevista, #btn-salvar-tarefa, #erro-tarefa (mensagem 'Data prevista obrigatória'); grupos #estagio-1 a #estagio-5; por tarefa: tarefa-{id}, tarefa-concluir-{id}, tarefa-data-conclusao-{id}, tarefa-editar-{id}, tarefa-excluir-{id} (RF3, RF5, RF15). Adição em sequência: o form limpa e devolve o foco ao título.
4. **Responsáveis** (#responsaveis, #tela-responsaveis): #form-responsavel, #responsavel-nome, #btn-salvar-responsavel, #erro-responsavel, #lista-responsaveis, responsavel-{id}, responsavel-editar-{id}, responsavel-excluir-{id}, diálogo #confirma-exclusao com #confirma-texto, #btn-confirmar-exclusao, #btn-cancelar-exclusao (RF2).
Navegação comum (#nav, montada por app.js): #nav-resumo, #nav-responsaveis, #btn-sair.

Carga: o resumo faz 2 consultas e calcula tudo no navegador.

## Tipos (contrato entre dados.js e regras.js)
- Projeto = {id, nome, data_prevista: 'aaaa-mm-dd', observacao: string|null, criado_em, atualizado_em: ISO}.
- Tarefa = {id, projeto_id, responsavel_id: number|null, responsavel_nome: string|null, titulo, estagio: 1..5, data_prevista: 'aaaa-mm-dd', concluida: boolean, data_conclusao: 'aaaa-mm-dd'|null, criado_em: ISO}. dados.js faz embed do responsável e achata em responsavel_nome.
- Responsavel = {id, nome}.
- LinhaResumo = {id, projeto, estagio: string ('Sem tarefas', 'Concluído' ou nome do estágio), proxima_tarefa: string|null, responsavel: string ('Sem responsável' se vazio), data_proxima: 'aaaa-mm-dd'|null, situacao: 'atrasado'|'no_prazo'|'adiantado'|'concluido_no_prazo'|'concluido_com_atraso', situacao_texto, ativo: boolean, incompleto: boolean, atualizado_em: ISO, dias_sem_atualizacao: number, desatualizado: boolean}.

## Decisões e trade-offs
- Regras puras em regras.js. Próxima tarefa: pendente com menor data_prevista, desempate por criado_em e id (RF6).
- **Conclusão do projeto (RF9)**: data = maior data_conclusao entre as tarefas. Antes da data prevista do projeto: Adiantado; igual: Concluído no prazo; depois: Concluído com atraso. Os três ficam só no filtro Concluídos.
- Estágios fixos em constante e check 1 a 5 (RF4). 'Hoje' via Intl em America/Sao_Paulo.
- RF16: dados.js grava atualizado_em em toda escrita de projeto ou tarefa (tocarProjeto). Sem trigger, centralizado.
- **Recuperação de senha**: redirectTo = location.origin + location.pathname, sem hash. app.js registra aoMudarAuth antes de rotear e ignora hashes com access_token ou type=recovery até o supabase-js processar; só então navega.
- Exclusão de projeto fica fora (não está no PRD).

## Segurança e LGPD
- RLS em todas as tabelas, políticas por operação para authenticated com user_id = (select auth.uid()); anon sem política.
- Só chave publishable; nada de segredo no repositório.
- Único dado pessoal: nome do responsável; exclusão definitiva via on delete set null.
- Renderização com textContent contra XSS.

## Arquivos

| Arquivo | Responsabilidade | Exporta |
|---|---|---|
| `index.html` | Esqueleto: #nav, containers #tela-login, #tela-resumo, #tela-projeto, #tela-responsaveis; carrega css/estilo.css e js/app.js como module. | - |
| `css/estilo.css` | Estilos responsivos (cartões em 360 px, tabela a partir de 640 px), selos de situação AA, destaque amarelo, foco visível, @media print A4 sem menus. | - |
| `js/app.js` | Integração: monta login, recuperação e nav com os ids do contrato; registra aoMudarAuth antes de rotear, trata PASSWORD_RECOVERY e ignora hash de tokens; hash routing, guarda de sessão, carrega dados e chama regras e telas. | `iniciar(): Promise<void>`<br>`navegar(rota: string): void` |
| `js/supabase.js` | Cliente Supabase com storageKey do app e funções de auth; enviarRecuperacao usa redirectTo = location.origin + location.pathname. | `supabase: SupabaseClient`<br>`entrar(email: string, senha: string): Promise<void>`<br>`sair(): Promise<void>`<br>`obterSessao(): Promise<Session\|null>`<br>`enviarRecuperacao(email: string): Promise<void>`<br>`definirNovaSenha(senha: string): Promise<void>`<br>`aoMudarAuth(cb: (evento: string, sessao: Session\|null) => void): void` |
| `js/dados.js` | Acesso às três tabelas retornando os tipos do contrato; achata embed do responsável em responsavel_nome; toda escrita de projeto ou tarefa chama tocarProjeto. | `listarProjetos(): Promise<Projeto[]>`<br>`obterProjeto(id: number): Promise<Projeto>`<br>`criarProjeto(p: {nome, data_prevista, observacao}): Promise<Projeto>`<br>`editarProjeto(id: number, p: object): Promise<Projeto>`<br>`listarTarefas(projetoId?: number): Promise<Tarefa[]>`<br>`criarTarefa(t: object): Promise<Tarefa>`<br>`editarTarefa(id: number, t: object): Promise<Tarefa>`<br>`concluirTarefa(id: number, data: string\|null): Promise<Tarefa>`<br>`excluirTarefa(id: number, projetoId: number): Promise<void>`<br>`listarResponsaveis(): Promise<Responsavel[]>`<br>`criarResponsavel(nome: string): Promise<Responsavel>`<br>`editarResponsavel(id: number, nome: string): Promise<Responsavel>`<br>`contarTarefasDoResponsavel(id: number): Promise<number>`<br>`excluirResponsavel(id: number): Promise<void>`<br>`tocarProjeto(id: number): Promise<void>` |
| `js/regras.js` | Funções puras: estágios, datas em Brasília, próxima tarefa, estágio, situação de tarefa e projeto (conclusão = maior data_conclusao), Incompleto, desatualizado, ordenação e filtro. | `ESTAGIOS: string[]`<br>`hojeBrasilia(): string`<br>`formatarData(iso: string): string`<br>`formatarDataHora(iso: string): string`<br>`diasDesde(iso: string): number`<br>`proximaTarefa(tarefas: Tarefa[]): Tarefa\|null`<br>`situacaoTarefa(t: Tarefa, hoje: string): 'atrasada'\|'adiantada'\|'no_prazo'`<br>`resumirProjeto(p: Projeto, tarefas: Tarefa[], hoje: string): LinhaResumo`<br>`ordenarResumo(linhas: LinhaResumo[]): LinhaResumo[]`<br>`filtrarResumo(linhas: LinhaResumo[], filtro: 'ativos'\|'atrasado'\|'no_prazo'\|'concluidos'): LinhaResumo[]`<br>`contarIncompletos(linhas: LinhaResumo[]): number` |
| `js/tela-resumo.js` | Monta em #tela-resumo indicador, filtro, botões e lista com os ids do contrato; aciona impressão com #resumo-gerado-em. | `renderResumo(linhas: LinhaResumo[], filtro: string, aoAbrir: (id: number) => void, aoFiltrar: (f: string) => void, aoNovo: () => void, aoExportar: () => void): void`<br>`imprimirResumo(): void` |
| `js/exportar.js` | Gera e baixa CSV da visão filtrada (BOM, ponto e vírgula, 6 colunas, dd/mm/aaaa). | `gerarCsv(linhas: LinhaResumo[]): string`<br>`baixarCsv(linhas: LinhaResumo[]): void` |
| `js/tela-projeto.js` | Monta em #tela-projeto formulário do projeto e de tarefa, grupos #estagio-1 a 5, conclusão, edição, exclusão, criação em sequência e validações. | `renderProjeto(id: number\|null, aoVoltar: () => void): Promise<void>` |
| `js/tela-responsaveis.js` | Monta em #tela-responsaveis o CRUD com diálogo de confirmação mostrando tarefas afetadas. | `renderResponsaveis(): Promise<void>` |

## Modelo de dados

sq_gestor_do_mato_07ca_responsaveis: id (bigint identity, PK); user_id (uuid not null, default auth.uid(), FK auth.users on delete cascade); nome (text not null, 1 a 80 após trim); criado_em (timestamptz default now()). Índice em user_id. Authenticated faz select, insert, update e delete só onde user_id = (select auth.uid()).

sq_gestor_do_mato_07ca_projetos: id (bigint identity, PK); user_id (como acima); nome (text not null, 1 a 120); data_prevista (date not null); observacao (text null, até 500); criado_em (timestamptz default now()); atualizado_em (timestamptz not null default now(), gravado pelo front em toda alteração do projeto ou de suas tarefas). Índice em user_id. Mesmas políticas por dono.

sq_gestor_do_mato_07ca_tarefas: id (bigint identity, PK, desempate); user_id (como acima); projeto_id (bigint not null, FK projetos on delete cascade); responsavel_id (bigint null, FK responsaveis on delete set null); titulo (text not null, 1 a 200); estagio (smallint not null, 1 a 5: Briefing, Planejamento, Execução, Revisão, Entrega); data_prevista (date not null); concluida (boolean not null default false); data_conclusao (date null); criado_em (timestamptz not null default now()). Check: concluida false com data_conclusao nula, ou true com data_conclusao preenchida. Índices em user_id, projeto_id e responsavel_id. Políticas por dono; insert e update exigem que projeto e responsável (se houver) sejam do mesmo user_id. Anon sem acesso a nenhuma tabela.

Prefixo das tabelas: `sq_gestor_do_mato_07ca_`

```sql
create table public.sq_gestor_do_mato_07ca_responsaveis (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome text not null check (char_length(trim(nome)) between 1 and 80),
  criado_em timestamptz not null default now()
);

create index sq_gestor_do_mato_07ca_responsaveis_user_idx on public.sq_gestor_do_mato_07ca_responsaveis (user_id);

alter table public.sq_gestor_do_mato_07ca_responsaveis enable row level security;

create policy sq_gestor_do_mato_07ca_responsaveis_select on public.sq_gestor_do_mato_07ca_responsaveis for select to authenticated using (user_id = (select auth.uid()));
create policy sq_gestor_do_mato_07ca_responsaveis_insert on public.sq_gestor_do_mato_07ca_responsaveis for insert to authenticated with check (user_id = (select auth.uid()));
create policy sq_gestor_do_mato_07ca_responsaveis_update on public.sq_gestor_do_mato_07ca_responsaveis for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy sq_gestor_do_mato_07ca_responsaveis_delete on public.sq_gestor_do_mato_07ca_responsaveis for delete to authenticated using (user_id = (select auth.uid()));

create table public.sq_gestor_do_mato_07ca_projetos (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome text not null check (char_length(trim(nome)) between 1 and 120),
  data_prevista date not null,
  observacao text null check (observacao is null or char_length(observacao) <= 500),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index sq_gestor_do_mato_07ca_projetos_user_idx on public.sq_gestor_do_mato_07ca_projetos (user_id);

alter table public.sq_gestor_do_mato_07ca_projetos enable row level security;

create policy sq_gestor_do_mato_07ca_projetos_select on public.sq_gestor_do_mato_07ca_projetos for select to authenticated using (user_id = (select auth.uid()));
create policy sq_gestor_do_mato_07ca_projetos_insert on public.sq_gestor_do_mato_07ca_projetos for insert to authenticated with check (user_id = (select auth.uid()));
create policy sq_gestor_do_mato_07ca_projetos_update on public.sq_gestor_do_mato_07ca_projetos for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy sq_gestor_do_mato_07ca_projetos_delete on public.sq_gestor_do_mato_07ca_projetos for delete to authenticated using (user_id = (select auth.uid()));

create table public.sq_gestor_do_mato_07ca_tarefas (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  projeto_id bigint not null references public.sq_gestor_do_mato_07ca_projetos(id) on delete cascade,
  responsavel_id bigint null references public.sq_gestor_do_mato_07ca_responsaveis(id) on delete set null,
  titulo text not null check (char_length(trim(titulo)) between 1 and 200),
  estagio smallint not null check (estagio between 1 and 5),
  data_prevista date not null,
  concluida boolean not null default false,
  data_conclusao date null,
  criado_em timestamptz not null default now(),
  constraint sq_gestor_do_mato_07ca_tarefas_conclusao_chk check ((concluida = false and data_conclusao is null) or (concluida = true and data_conclusao is not null))
);

create index sq_gestor_do_mato_07ca_tarefas_user_idx on public.sq_gestor_do_mato_07ca_tarefas (user_id);
create index sq_gestor_do_mato_07ca_tarefas_projeto_idx on public.sq_gestor_do_mato_07ca_tarefas (projeto_id);
create index sq_gestor_do_mato_07ca_tarefas_responsavel_idx on public.sq_gestor_do_mato_07ca_tarefas (responsavel_id);

alter table public.sq_gestor_do_mato_07ca_tarefas enable row level security;

create policy sq_gestor_do_mato_07ca_tarefas_select on public.sq_gestor_do_mato_07ca_tarefas for select to authenticated using (user_id = (select auth.uid()));
create policy sq_gestor_do_mato_07ca_tarefas_insert on public.sq_gestor_do_mato_07ca_tarefas for insert to authenticated with check (user_id = (select auth.uid()) and exists (select 1 from public.sq_gestor_do_mato_07ca_projetos p where p.id = projeto_id and p.user_id = (select auth.uid())) and (responsavel_id is null or exists (select 1 from public.sq_gestor_do_mato_07ca_responsaveis r where r.id = responsavel_id and r.user_id = (select auth.uid()))));
create policy sq_gestor_do_mato_07ca_tarefas_update on public.sq_gestor_do_mato_07ca_tarefas for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and exists (select 1 from public.sq_gestor_do_mato_07ca_projetos p where p.id = projeto_id and p.user_id = (select auth.uid())) and (responsavel_id is null or exists (select 1 from public.sq_gestor_do_mato_07ca_responsaveis r where r.id = responsavel_id and r.user_id = (select auth.uid()))));
create policy sq_gestor_do_mato_07ca_tarefas_delete on public.sq_gestor_do_mato_07ca_tarefas for delete to authenticated using (user_id = (select auth.uid()));

comment on table public.sq_gestor_do_mato_07ca_tarefas is 'Estagio: 1 Briefing, 2 Planejamento, 3 Execucao, 4 Revisao, 5 Entrega.';
```

Este SQL só é aplicado depois da sua aprovação, pelo executor seguro: só tabelas com o prefixo do projeto, RLS obrigatório, sem funções, sem DROP e sem GRANT.

## Plano de tarefas

| # | Tarefa | Dev | Arquivos |
|---|---|---|---|
| 1 | **Integração, login e esqueleto**<br>index.html com containers e nav; supabase.js com auth e redirectTo sem hash; app.js monta login e nova senha, registra aoMudarAuth antes de rotear, ignora hash com access_token/type=recovery, roteia e liga telas a dados e regras. | Eduardo | `index.html`<br>`js/app.js`<br>`js/supabase.js` |
| 2 | **Camada de dados**<br>dados.js com CRUD das três tabelas retornando Projeto, Tarefa (responsavel_nome achatado) e Responsavel do contrato; tocarProjeto em toda escrita; erros claros. | Fernanda | `js/dados.js` |
| 3 | **Regras, resumo e exportação**<br>regras.js puro (RF6 a RF12, RF16, conclusão do projeto = maior data_conclusao) gerando LinhaResumo; tela de resumo com ids do contrato e impressão; CSV RF14. | Gabriel | `js/regras.js`<br>`js/tela-resumo.js`<br>`js/exportar.js` |
| 4 | **Detalhe, responsáveis e estilos**<br>Tela de projeto (RF3, RF5, RF15) e responsáveis (RF2) com ids do contrato e mensagem 'Data prevista obrigatória'; CSS responsivo, acessível e de impressão A4. | Helena | `js/tela-projeto.js`<br>`js/tela-responsaveis.js`<br>`css/estilo.css` |
