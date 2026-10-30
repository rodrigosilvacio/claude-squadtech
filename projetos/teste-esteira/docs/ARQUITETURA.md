# Arquitetura · Teste da esteira (pode apagar)

**Versão:** 1 · **Proposta:** Carla · **Revisão:** Diego

## Stack
- HTML, CSS e JS (ES modules) sem build, no GitHub Pages, só caminhos relativos.
- Supabase (Postgres com RLS, Auth, consulta periódica) via `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.5/+esm`.
- QR via `https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm`.
- Duas páginas: `index.html` (dono, rotas por hash) e `checkin.html` (pública).

## Telas e fluxos
- **Login** (RF1): sem sessão Auth, só esta tela.
- **Workshops** (RF2, RF10, RF12): lista, criar, editar, excluir; detalhe com sessões, taxa total e por sessão encerrada, Exportar CSV.
- **Inscritos** (RF3, RF4, RF5, RF13): modelo, importação com relatório, adicionar, excluir com confirmação.
- **Sessão / check-in** (RF5 a RF8, RF16): busca, contador, marcar e desfazer, adicionar na hora, encerrar, reabrir, novo token.
- **Projetar QR** (RF14, RF16): tela cheia, QR com 60% da altura, URL e contador.
- **Faltantes** (RF9): mailto individual e com todos em Cco.
- **Participante** (RF11): histórico.
- **checkin.html** (RF15): e-mail e Confirmar presença.

## Decisões e trade-offs
- **RF15 adaptado (precisa do aval do Rodrigo).** O executor de SQL não aceita funções, então não há RPC. Fluxo:
  1. A página pública insere um pedido em `checkin_pedidos` (uuid gerado no navegador, sessao_id, token, e-mail normalizado), status `pendente`.
  2. Qualquer tela logada do dono roda o processador (iniciado em app.js para todas as sessões abertas do dono, a cada 2 s). Ele reivindica cada pedido com `update set status='processando' where id=X and status='pendente'` e `.select()`; só quem recebe a linha processa. Valida token, sessão aberta e inscrição, grava a presença com upsert ignoreDuplicates (origem `qr`) e o status final.
  3. A página pública lê só a coluna status do próprio pedido, filtrada pelo header `x-pedido`.
- **Mudança nos critérios:** o anon passa a inserir em uma tabela (só pedidos, sem ler dados de terceiros). A resposta depende de uma tela do dono aberta; se nada responder em 20 s, aparece uma quinta mensagem: "Recebemos seu pedido, confira com o organizador". Critérios RF15/RF8 e RF14 (token antigo) passam a valer com uma tela do dono aberta; sem ela, o participante vê a quinta mensagem e nada é gravado em presenças.
- **Cliente público isolado:** como todos os apps compartilham origem e localStorage, ele é criado com persistSession, autoRefreshToken e detectSessionInUrl desligados, storageKey próprio e header x-pedido. Sempre age como anon.
- **Horário do servidor:** `registrado_em` default now(). Remarcar apaga e insere, valendo o último horário. QR repetido não altera a presença.
- **RF16:** consulta de 2 s em vez de Realtime.
- **CSV:** parser próprio que detecta `;` ou `,` e trata aspas; exportação UTF-8 com BOM e `;`.

## Segurança e LGPD
- RLS em todas as tabelas; dono acessa por `user_id = (select auth.uid())` ou via sessão dele.
- Anon: insert de pedido pendente (e-mail até 254) e select do pedido cujo id bate com o header. Insert com returning minimal. Nenhuma outra tabela.
- Só a chave publishable. Token de 128 bits com `crypto.getRandomValues`, nunca lido pelo anon.
- Cascade: apagar participante remove inscrições e presenças (RF13).
- Retenção de pedidos: ao encerrar, processa os pendentes uma última vez e apaga todos os pedidos da sessão. Ao iniciar o app, apaga pedidos com mais de 1 dia nas sessões do dono.
- Coleta mínima; página pública sem dados de inscritos. Enumeração aceita, conforme o PRD.

## Arquivos

| Arquivo | Responsabilidade | Exporta |
|---|---|---|
| `index.html` | Casca da área do dono: contêiner das telas e carregamento de js/app.js | - |
| `css/estilo.css` | Estilos mobile first, contraste AA, botões de 44 px, tela de QR 16:9 (também usado por checkin.html) | - |
| `js/app.js` | Roteador por hash, guarda de login, montagem das telas, limpeza de pedidos antigos e processador global de pedidos para as sessões abertas do dono | `iniciarApp(): Promise<void>`<br>`navegar(rota: string): void` |
| `js/supabase.js` | Cliente Supabase do dono, autenticação e cliente público isolado (sem persistência de sessão, storageKey próprio, header x-pedido) | `supabase: SupabaseClient`<br>`entrar(email: string, senha: string): Promise<void>`<br>`sair(): Promise<void>`<br>`usuarioAtual(): Promise<User\|null>`<br>`criarClientePublico(idPedido: string): SupabaseClient` |
| `js/dados.js` | CRUD de workshops, sessões, participantes, inscrições e presenças, taxa, histórico e linhas de exportação | `listarWorkshops(): Promise<Workshop[]>`<br>`salvarWorkshop(w: Workshop): Promise<Workshop>`<br>`excluirWorkshop(id: string): Promise<void>`<br>`listarSessoes(workshopId: string): Promise<Sessao[]>`<br>`listarSessoesAbertas(): Promise<Sessao[]>`<br>`obterSessao(id: string): Promise<Sessao>`<br>`salvarSessao(s: Sessao): Promise<Sessao>`<br>`excluirSessao(id: string): Promise<void>`<br>`gerarToken(): string`<br>`renovarToken(sessaoId: string): Promise<string>`<br>`encerrarSessao(id: string): Promise<void>`<br>`reabrirSessao(id: string): Promise<void>`<br>`listarInscritos(workshopId: string): Promise<Participante[]>`<br>`upsertInscrito(workshopId: string, p: {nome: string, email: string, empresa?: string}): Promise<'inserido'\|'atualizado'>`<br>`excluirParticipante(id: string): Promise<void>`<br>`listarPresencas(sessaoId: string): Promise<Presenca[]>`<br>`marcarPresenca(sessaoId: string, participanteId: string, origem: 'manual'\|'qr'): Promise<Presenca>`<br>`desfazerPresenca(sessaoId: string, participanteId: string): Promise<void>`<br>`taxaPresenca(workshopId: string): Promise<{total: number, porSessao: {sessao: Sessao, taxa: number}[]}>`<br>`historicoParticipante(id: string): Promise<ItemHistorico[]>`<br>`linhasExportacao(workshopId: string): Promise<LinhaCsv[]>`<br>`normalizarEmail(e: string): string` |
| `js/csv.js` | Parser de CSV com detecção de separador e validação de linhas, geração (UTF-8 com BOM, ponto e vírgula) e download | `lerCsv(texto: string): {linhas: {nome: string, email: string, empresa: string, numero: number}[], rejeitadas: {linha: number, motivo: string}[]}`<br>`gerarCsv(linhas: object[], colunas: string[]): string`<br>`baixarArquivo(nome: string, conteudo: string): void`<br>`baixarModelo(): void` |
| `js/telas-workshops.js` | Telas de login, workshops (taxa e exportação) e inscritos (importação com relatório, adicionar, excluir) | `telaLogin(el: HTMLElement): void`<br>`telaWorkshops(el: HTMLElement): Promise<void>`<br>`telaWorkshop(el: HTMLElement, id: string): Promise<void>`<br>`telaInscritos(el: HTMLElement, workshopId: string): Promise<void>` |
| `js/telas-sessao.js` | Telas de check-in, projeção de QR e faltantes, com atualização a cada 2 s; encerrar chama processarPendentes e limparPedidosSessao | `telaCheckin(el: HTMLElement, sessaoId: string): Promise<() => void>`<br>`telaQr(el: HTMLElement, sessaoId: string): Promise<() => void>`<br>`telaFaltantes(el: HTMLElement, sessaoId: string): Promise<void>` |
| `js/processador-qr.js` | Reivindica pedidos pendentes (pendente para processando), valida token, sessão aberta e inscrição, grava presença com upsert ignoreDuplicates e status final; limpeza de pedidos | `processarPendentes(sessaoId?: string): Promise<number>`<br>`iniciarProcessamento(aoMudar: () => void): () => void`<br>`limparPedidosSessao(sessaoId: string): Promise<void>`<br>`limparPedidosAntigos(): Promise<void>` |
| `js/telas-participante.js` | Tela de histórico do participante | `telaParticipante(el: HTMLElement, id: string): Promise<void>` |
| `checkin.html` | Página pública de check-in: campo de e-mail (type=email) e botão Confirmar presença | - |
| `js/checkin-publico.js` | Lê sessão e token da URL, insere o pedido (returning minimal), consulta só o status pelo header e mostra a mensagem, sem dados pessoais | `iniciarCheckinPublico(): void`<br>`enviarPedido(sessaoId: string, token: string, email: string): Promise<string>`<br>`aguardarStatus(idPedido: string, limiteMs: number): Promise<string>` |

## Modelo de dados

Prefixo sq_teste_esteira_9f79_ em todas as tabelas. RLS ativa em todas.

1. workshops: id uuid pk, user_id uuid fk auth.users not null default auth.uid(), nome text not null, data date not null, criado_em timestamptz default now(). authenticated: select, insert, update, delete onde user_id = auth.uid().

2. sessoes: id uuid pk, workshop_id fk workshops on delete cascade, user_id default auth.uid(), nome text not null, inicio timestamptz, token text not null (length >= 32), aberta boolean default true, encerrada_em timestamptz. authenticated: todas as operações onde user_id = auth.uid() e o workshop é do dono.

3. participantes: id uuid pk, user_id default auth.uid(), nome text not null, email text not null (email = lower(trim(email)), até 254), empresa text. Unique (user_id, email). authenticated: todas as operações do dono.

4. inscricoes: id uuid pk, user_id, workshop_id fk cascade, participante_id fk cascade. Unique (workshop_id, participante_id). authenticated: todas as operações do dono, com workshop e participante do dono.

5. presencas: id uuid pk, user_id, sessao_id fk cascade, participante_id fk cascade, registrado_em timestamptz default now(), origem check in ('qr','manual'). Unique (sessao_id, participante_id). authenticated: select, insert e delete do dono. Sem update.

6. checkin_pedidos: id uuid pk (gerado no navegador), sessao_id fk sessoes cascade, token text (até 128), email text (até 254), status text default 'pendente' check in ('pendente','processando','confirmada','ja_registrada','nao_inscrito','encerrado'), criado_em default now(). Índices em (sessao_id, status) e (criado_em).
- anon: insert com status = 'pendente'; select só onde id = header x-pedido.
- authenticated: select, update e delete onde a sessão é do dono.

Prefixo das tabelas: `sq_teste_esteira_9f79_`

```sql
create table public.sq_teste_esteira_9f79_workshops (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade, nome text not null check (length(nome) between 1 and 200), data date not null, criado_em timestamptz not null default now());
create table public.sq_teste_esteira_9f79_sessoes (id uuid primary key default gen_random_uuid(), workshop_id uuid not null references public.sq_teste_esteira_9f79_workshops(id) on delete cascade, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade, nome text not null check (length(nome) between 1 and 200), inicio timestamptz, token text not null check (length(token) >= 32), aberta boolean not null default true, encerrada_em timestamptz);
create table public.sq_teste_esteira_9f79_participantes (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade, nome text not null check (length(nome) between 1 and 200), email text not null check (email = lower(trim(email)) and length(email) between 3 and 254), empresa text check (empresa is null or length(empresa) <= 200), unique (user_id, email));
create table public.sq_teste_esteira_9f79_inscricoes (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade, workshop_id uuid not null references public.sq_teste_esteira_9f79_workshops(id) on delete cascade, participante_id uuid not null references public.sq_teste_esteira_9f79_participantes(id) on delete cascade, unique (workshop_id, participante_id));
create table public.sq_teste_esteira_9f79_presencas (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade, sessao_id uuid not null references public.sq_teste_esteira_9f79_sessoes(id) on delete cascade, participante_id uuid not null references public.sq_teste_esteira_9f79_participantes(id) on delete cascade, registrado_em timestamptz not null default now(), origem text not null check (origem in ('qr','manual')), unique (sessao_id, participante_id));
create table public.sq_teste_esteira_9f79_checkin_pedidos (id uuid primary key, sessao_id uuid not null references public.sq_teste_esteira_9f79_sessoes(id) on delete cascade, token text not null check (length(token) <= 128), email text not null check (length(email) between 1 and 254), status text not null default 'pendente' check (status in ('pendente','processando','confirmada','ja_registrada','nao_inscrito','encerrado')), criado_em timestamptz not null default now());
create index sq_teste_esteira_9f79_workshops_user_idx on public.sq_teste_esteira_9f79_workshops (user_id);
create index sq_teste_esteira_9f79_sessoes_workshop_idx on public.sq_teste_esteira_9f79_sessoes (workshop_id);
create index sq_teste_esteira_9f79_sessoes_user_idx on public.sq_teste_esteira_9f79_sessoes (user_id);
create index sq_teste_esteira_9f79_inscricoes_participante_idx on public.sq_teste_esteira_9f79_inscricoes (participante_id);
create index sq_teste_esteira_9f79_inscricoes_user_idx on public.sq_teste_esteira_9f79_inscricoes (user_id);
create index sq_teste_esteira_9f79_presencas_participante_idx on public.sq_teste_esteira_9f79_presencas (participante_id);
create index sq_teste_esteira_9f79_presencas_user_idx on public.sq_teste_esteira_9f79_presencas (user_id);
create index sq_teste_esteira_9f79_pedidos_sessao_status_idx on public.sq_teste_esteira_9f79_checkin_pedidos (sessao_id, status);
create index sq_teste_esteira_9f79_pedidos_criado_idx on public.sq_teste_esteira_9f79_checkin_pedidos (criado_em);
alter table public.sq_teste_esteira_9f79_workshops enable row level security;
alter table public.sq_teste_esteira_9f79_sessoes enable row level security;
alter table public.sq_teste_esteira_9f79_participantes enable row level security;
alter table public.sq_teste_esteira_9f79_inscricoes enable row level security;
alter table public.sq_teste_esteira_9f79_presencas enable row level security;
alter table public.sq_teste_esteira_9f79_checkin_pedidos enable row level security;
create policy workshops_select on public.sq_teste_esteira_9f79_workshops for select to authenticated using (user_id = (select auth.uid()));
create policy workshops_insert on public.sq_teste_esteira_9f79_workshops for insert to authenticated with check (user_id = (select auth.uid()));
create policy workshops_update on public.sq_teste_esteira_9f79_workshops for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy workshops_delete on public.sq_teste_esteira_9f79_workshops for delete to authenticated using (user_id = (select auth.uid()));
create policy sessoes_select on public.sq_teste_esteira_9f79_sessoes for select to authenticated using (user_id = (select auth.uid()));
create policy sessoes_insert on public.sq_teste_esteira_9f79_sessoes for insert to authenticated with check (user_id = (select auth.uid()) and exists (select 1 from public.sq_teste_esteira_9f79_workshops w where w.id = workshop_id and w.user_id = (select auth.uid())));
create policy sessoes_update on public.sq_teste_esteira_9f79_sessoes for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and exists (select 1 from public.sq_teste_esteira_9f79_workshops w where w.id = workshop_id and w.user_id = (select auth.uid())));
create policy sessoes_delete on public.sq_teste_esteira_9f79_sessoes for delete to authenticated using (user_id = (select auth.uid()));
create policy participantes_select on public.sq_teste_esteira_9f79_participantes for select to authenticated using (user_id = (select auth.uid()));
create policy participantes_insert on public.sq_teste_esteira_9f79_participantes for insert to authenticated with check (user_id = (select auth.uid()));
create policy participantes_update on public.sq_teste_esteira_9f79_participantes for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy participantes_delete on public.sq_teste_esteira_9f79_participantes for delete to authenticated using (user_id = (select auth.uid()));
create policy inscricoes_select on public.sq_teste_esteira_9f79_inscricoes for select to authenticated using (user_id = (select auth.uid()));
create policy inscricoes_insert on public.sq_teste_esteira_9f79_inscricoes for insert to authenticated with check (user_id = (select auth.uid()) and exists (select 1 from public.sq_teste_esteira_9f79_workshops w where w.id = workshop_id and w.user_id = (select auth.uid())) and exists (select 1 from public.sq_teste_esteira_9f79_participantes p where p.id = participante_id and p.user_id = (select auth.uid())));
create policy inscricoes_update on public.sq_teste_esteira_9f79_inscricoes for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and exists (select 1 from public.sq_teste_esteira_9f79_workshops w where w.id = workshop_id and w.user_id = (select auth.uid())) and exists (select 1 from public.sq_teste_esteira_9f79_participantes p where p.id = participante_id and p.user_id = (select auth.uid())));
create policy inscricoes_delete on public.sq_teste_esteira_9f79_inscricoes for delete to authenticated using (user_id = (select auth.uid()));
create policy presencas_select on public.sq_teste_esteira_9f79_presencas for select to authenticated using (user_id = (select auth.uid()));
create policy presencas_insert on public.sq_teste_esteira_9f79_presencas for insert to authenticated with check (user_id = (select auth.uid()) and exists (select 1 from public.sq_teste_esteira_9f79_sessoes s where s.id = sessao_id and s.user_id = (select auth.uid())) and exists (select 1 from public.sq_teste_esteira_9f79_participantes p where p.id = participante_id and p.user_id = (select auth.uid())));
create policy presencas_delete on public.sq_teste_esteira_9f79_presencas for delete to authenticated using (user_id = (select auth.uid()));
create policy pedidos_insert_anon on public.sq_teste_esteira_9f79_checkin_pedidos for insert to anon with check (status = 'pendente' and length(email) <= 254 and length(token) <= 128);
create policy pedidos_select_anon on public.sq_teste_esteira_9f79_checkin_pedidos for select to anon using (id::text = (current_setting('request.headers', true)::json ->> 'x-pedido'));
create policy pedidos_select_dono on public.sq_teste_esteira_9f79_checkin_pedidos for select to authenticated using (exists (select 1 from public.sq_teste_esteira_9f79_sessoes s where s.id = sessao_id and s.user_id = (select auth.uid())));
create policy pedidos_update_dono on public.sq_teste_esteira_9f79_checkin_pedidos for update to authenticated using (exists (select 1 from public.sq_teste_esteira_9f79_sessoes s where s.id = sessao_id and s.user_id = (select auth.uid()))) with check (exists (select 1 from public.sq_teste_esteira_9f79_sessoes s where s.id = sessao_id and s.user_id = (select auth.uid())));
create policy pedidos_delete_dono on public.sq_teste_esteira_9f79_checkin_pedidos for delete to authenticated using (exists (select 1 from public.sq_teste_esteira_9f79_sessoes s where s.id = sessao_id and s.user_id = (select auth.uid())));
comment on table public.sq_teste_esteira_9f79_checkin_pedidos is 'Pedidos de check-in por QR. Anon insere pendente e le so o proprio via header x-pedido.';
```

Este SQL só é aplicado depois da sua aprovação, pelo executor seguro: só tabelas com o prefixo do projeto, RLS obrigatório, sem funções, sem DROP e sem GRANT.

## Plano de tarefas

| # | Tarefa | Dev | Arquivos |
|---|---|---|---|
| 1 | **Integração, auth e casca**<br>index.html, roteador com guarda de login (RF1), processador global e limpeza de pedidos antigos no iniciarApp. supabase.js com cliente público: auth {persistSession:false, autoRefreshToken:false, detectSessionInUrl:false}, storageKey próprio e global.headers {'x-pedido': idPedido}. CSS global acessível. | Eduardo | `index.html`<br>`js/app.js`<br>`js/supabase.js`<br>`css/estilo.css` |
| 2 | **Dados e telas de workshop**<br>Contratos de dados.js, taxa (RF10), linhas de exportação (RF12), telas de login, workshops e inscritos (RF2 a RF5, RF13) usando csv.js pelo contrato. | Fernanda | `js/dados.js`<br>`js/telas-workshops.js` |
| 3 | **Sessão, QR e processamento**<br>Check-in manual (RF6, RF7), encerrar com último processamento e limpeza de todos os pedidos (RF8), faltantes (RF9), QR (RF14), processador com reivindicação via status processando e upsert ignoreDuplicates (RF15, RF16), histórico (RF11). | Gabriel | `js/telas-sessao.js`<br>`js/processador-qr.js`<br>`js/telas-participante.js` |
| 4 | **Página pública e CSV**<br>checkin.html e checkin-publico.js: pedido com uuid, insert returning minimal, select só de status, espera de 20 s, as quatro mensagens do RF15 mais a de contingência. csv.js: parser com detecção de separador, validação, geração com BOM, download e modelo. | Helena | `checkin.html`<br>`js/checkin-publico.js`<br>`js/csv.js` |
