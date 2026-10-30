-- SquadTech · Fase 4 (Sala de Testes)
-- A etapa "testes" é automática, menos o subpasso "navegador": ali a esteira espera
-- o escritório aberto no navegador do cliente rodar os testes e devolver o resultado
-- (squad-pedir, ação "testes"). Por isso o trigger e o cron ignoram esse subpasso.

alter table public.squad_projetos
  add column tokens_cache bigint not null default 0;
comment on column public.squad_projetos.tokens_cache is 'Tokens de entrada lidos do cache de prompt (cobrados a ~5% do preço; não contam no teto).';

create or replace function public.squad_etapa_automatica(p_etapa text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_etapa in ('entrevista', 'prd', 'arquitetura', 'migracao', 'planejamento', 'desenvolvimento', 'integracao', 'testes', 'delivery');
$$;

create or replace function public.squad_seguir_esteira()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.squad_etapa_automatica(new.etapa) and new.erro is null and new.subpasso is distinct from 'navegador' then
    perform public.squad_disparar_etapa(new.id);
  end if;
  return null;
end;
$$;

create or replace function public.squad_reenviar_paradas()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
begin
  for p in
    select id, tentativas from public.squad_projetos
    where public.squad_etapa_automatica(etapa)
      and erro is null
      and subpasso is distinct from 'navegador'
      and coalesce(passo_em, atualizado_em) < now() - interval '4 minutes'
  loop
    if p.tentativas >= 3 then
      update public.squad_projetos
        set erro = 'A esteira parou 3 vezes neste passo. Clique em Retomar para tentar de novo.', passo_em = null
        where id = p.id;
      insert into public.squad_eventos (projeto_id, tipo, texto, dados)
        values (p.id, 'sistema', 'A esteira parou neste passo. Use "Retomar" para tentar de novo.', '{"erro": true}');
    else
      update public.squad_projetos set tentativas = tentativas + 1, passo_em = null where id = p.id;
      perform public.squad_disparar_etapa(p.id);
    end if;
  end loop;
end;
$$;

revoke execute on function public.squad_seguir_esteira() from public, anon, authenticated;
revoke execute on function public.squad_reenviar_paradas() from public, anon, authenticated;
