-- SquadTech · Fase 5 (evolução de apps entregues e remoção de projetos)
-- ciclo: 1 na primeira entrega; cada "Pedir ajuste" abre um novo ciclo que reaproveita
-- o PRD, a arquitetura, o banco e o código do ciclo anterior.
-- apagando: etapa automática em que o Lucas remove as tabelas do app, a pasta no
-- GitHub e, por fim, o próprio projeto (eventos, artefatos e testes vão em cascata).

alter table public.squad_projetos
  add column ciclo int not null default 1;
comment on column public.squad_projetos.ciclo is 'Versão do app: 1 na primeira entrega, +1 a cada pedido de ajuste depois de entregue.';

alter table public.squad_projetos drop constraint squad_projetos_etapa_check;
alter table public.squad_projetos add constraint squad_projetos_etapa_check check (etapa = any (array[
  'entrevista', 'aguardando_respostas', 'prd', 'aguardando_aprovacao_prd', 'arquitetura',
  'aguardando_aprovacao_arquitetura', 'migracao', 'planejamento', 'desenvolvimento', 'integracao',
  'testes', 'aguardando_testes_navegador', 'delivery', 'concluido', 'escalado', 'cancelado', 'apagando'
]));

create or replace function public.squad_etapa_automatica(p_etapa text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_etapa in ('entrevista', 'prd', 'arquitetura', 'migracao', 'planejamento', 'desenvolvimento', 'integracao', 'testes', 'delivery', 'apagando');
$$;

-- Remove as tabelas de um app gerado. Travas: o prefixo tem o formato do squad,
-- pertence a um projeto que está sendo apagado e só tabelas de public que começam
-- exatamente com ele são removidas (comparação literal, sem curingas do LIKE).
create function public.squad_remover_tabelas(p_prefixo text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
  n int := 0;
begin
  if p_prefixo is null or p_prefixo !~ '^sq_[a-z0-9_]+_[0-9a-f]{4}_$' or length(p_prefixo) > 30 then
    raise exception 'Prefixo inválido: %', p_prefixo;
  end if;
  if not exists (select 1 from public.squad_projetos where prefixo_db = p_prefixo and etapa = 'apagando') then
    raise exception 'Nenhum projeto sendo apagado usa o prefixo %', p_prefixo;
  end if;
  for t in
    select tablename from pg_catalog.pg_tables
    where schemaname = 'public' and left(tablename, length(p_prefixo)) = p_prefixo
  loop
    execute format('drop table if exists public.%I cascade', t.tablename);
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke execute on function public.squad_remover_tabelas(text) from public, anon, authenticated;
grant execute on function public.squad_remover_tabelas(text) to service_role;
