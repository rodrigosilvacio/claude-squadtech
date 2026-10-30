-- SquadTech · Fase 0 (Fundação)
-- Tabelas do escritório de agentes. Prefixo squad_ porque o projeto Supabase
-- ClaudeProjects é compartilhado com outros apps. Toda escrita acontece pelas
-- Edge Functions (service role); o navegador só lê o que é do próprio usuário.

-- ---------- configuração (só service role) ----------
create table public.squad_config (
  chave text primary key,
  valor text not null,
  descricao text
);
alter table public.squad_config enable row level security;
comment on table public.squad_config is 'Parâmetros do SquadTech (limites, modelo, segredos internos). Sem políticas: só as Edge Functions (service role) leem.';

insert into public.squad_config (chave, valor, descricao) values
  ('modelo', 'claude-opus-5-5', 'Modelo usado por todos os agentes'),
  ('limite_projetos_dia', '5', 'Projetos novos por usuário em 24h'),
  ('teto_tokens_projeto', '2000000', 'Teto de tokens (entrada + saída) por projeto'),
  ('max_rodadas_perguntas', '3', 'Rodadas de perguntas da Ana'),
  ('max_rodadas_qa', '3', 'Rodadas de QA antes de escalar ao usuário'),
  ('max_arquivos', '15', 'Arquivos por projeto gerado'),
  ('max_caracteres_arquivo', '60000', 'Tamanho máximo de cada arquivo gerado');

-- ---------- allowlist ----------
create table public.squad_usuarios (
  user_id uuid primary key references auth.users (id) on delete cascade,
  criado_em timestamptz not null default now()
);
alter table public.squad_usuarios enable row level security;
comment on table public.squad_usuarios is 'Contas do auth.users (compartilhado entre apps) com acesso ao SquadTech. Escrita só por migração ou service role.';

create function public.squad_eh_membro()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.squad_usuarios where user_id = auth.uid());
$$;
revoke execute on function public.squad_eh_membro() from public, anon;
grant execute on function public.squad_eh_membro() to authenticated;

create policy "membro vê o próprio cadastro" on public.squad_usuarios
  for select to authenticated using (user_id = (select auth.uid()));

-- ---------- projetos ----------
create table public.squad_projetos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 50),
  nome text not null check (length(nome) between 3 and 120),
  briefing text not null check (length(briefing) between 10 and 6000),
  etapa text not null default 'entrevista' check (etapa in (
    'entrevista', 'aguardando_respostas', 'prd', 'aguardando_aprovacao_prd',
    'arquitetura', 'aguardando_aprovacao_arquitetura', 'migracao',
    'planejamento', 'desenvolvimento', 'integracao', 'testes',
    'aguardando_testes_navegador', 'delivery', 'concluido', 'escalado', 'cancelado'
  )),
  rodada_po int not null default 1,
  rodada_arq int not null default 1,
  rodada_qa int not null default 0,
  passo_em timestamptz,
  tentativas int not null default 0,
  erro text,
  pendencias text,
  tokens_entrada bigint not null default 0,
  tokens_saida bigint not null default 0,
  url_app text,
  url_repo text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index squad_projetos_user_idx on public.squad_projetos (user_id, criado_em desc);
alter table public.squad_projetos enable row level security;
comment on table public.squad_projetos is 'Um projeto = um briefing passando pela esteira das 5 salas. etapa é a máquina de estados; escrita só pelas Edge Functions.';

create policy "membro vê os próprios projetos" on public.squad_projetos
  for select to authenticated
  using (user_id = (select auth.uid()) and (select public.squad_eh_membro()));

-- ---------- eventos (painel ao vivo) ----------
create table public.squad_eventos (
  id bigint generated always as identity primary key,
  projeto_id uuid not null references public.squad_projetos (id) on delete cascade,
  tipo text not null check (tipo in ('fase', 'fala', 'estado', 'reunir', 'handoff', 'artefato', 'portao', 'sistema', 'fim')),
  agente text,
  para text,
  sala text check (sala in ('produto', 'arquitetura', 'desenvolvimento', 'testes', 'delivery')),
  texto text,
  dados jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);
create index squad_eventos_projeto_idx on public.squad_eventos (projeto_id, id);
alter table public.squad_eventos enable row level security;
comment on table public.squad_eventos is 'Linha do tempo do escritório: falas, estados, handoffs e portões. Alimenta a animação e o painel de conversa via Realtime.';

create policy "membro vê eventos dos próprios projetos" on public.squad_eventos
  for select to authenticated
  using (exists (select 1 from public.squad_projetos p where p.id = projeto_id and p.user_id = (select auth.uid())));

-- ---------- artefatos (versionados) ----------
create table public.squad_artefatos (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.squad_projetos (id) on delete cascade,
  tipo text not null check (tipo in ('briefing', 'perguntas', 'respostas', 'prd', 'arquitetura', 'sql', 'plano', 'arquivo', 'revisao_codigo', 'testes', 'relatorio_testes', 'entrega')),
  caminho text,
  versao int not null default 1,
  conteudo text not null,
  autor text,
  aprovado boolean,
  comentario text,
  criado_em timestamptz not null default now()
);
create unique index squad_artefatos_unico on public.squad_artefatos (projeto_id, tipo, coalesce(caminho, ''), versao);
alter table public.squad_artefatos enable row level security;
comment on table public.squad_artefatos is 'Tudo o que os agentes produzem (PRD, arquitetura, SQL, arquivos de código, relatórios), com versão.';

create policy "membro vê artefatos dos próprios projetos" on public.squad_artefatos
  for select to authenticated
  using (exists (select 1 from public.squad_projetos p where p.id = projeto_id and p.user_id = (select auth.uid())));

-- ---------- tarefas de desenvolvimento ----------
create table public.squad_tarefas (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.squad_projetos (id) on delete cascade,
  n int not null,
  titulo text not null,
  descricao text not null,
  agente text not null check (agente in ('eduardo', 'fernanda', 'gabriel', 'helena')),
  arquivos text[] not null default '{}',
  status text not null default 'pendente' check (status in ('pendente', 'em_andamento', 'concluida', 'erro')),
  rodada int not null default 1,
  resultado text,
  passo_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (projeto_id, rodada, n)
);
alter table public.squad_tarefas enable row level security;

create policy "membro vê tarefas dos próprios projetos" on public.squad_tarefas
  for select to authenticated
  using (exists (select 1 from public.squad_projetos p where p.id = projeto_id and p.user_id = (select auth.uid())));

-- ---------- execuções de teste ----------
create table public.squad_testes (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.squad_projetos (id) on delete cascade,
  rodada int not null,
  origem text not null check (origem in ('navegador', 'revisao')),
  aprovado boolean not null,
  resultado jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);
create index squad_testes_projeto_idx on public.squad_testes (projeto_id, rodada);
alter table public.squad_testes enable row level security;

create policy "membro vê testes dos próprios projetos" on public.squad_testes
  for select to authenticated
  using (exists (select 1 from public.squad_projetos p where p.id = projeto_id and p.user_id = (select auth.uid())));

-- ---------- atualizado_em ----------
create function public.squad_tocar_atualizado()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger squad_projetos_atualizado before update on public.squad_projetos
  for each row execute function public.squad_tocar_atualizado();
create trigger squad_tarefas_atualizado before update on public.squad_tarefas
  for each row execute function public.squad_tocar_atualizado();

-- ---------- realtime ----------
alter publication supabase_realtime add table public.squad_eventos, public.squad_projetos;
