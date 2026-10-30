-- SquadTech · Fase 1 (Sala de Produto real)
-- Esteira disparada pelo banco: cada mudança de etapa/subpasso chama a Edge
-- Function squad-esteira via pg_net, que executa UM passo (cabe em ~150s) e
-- avança o projeto. Um cron reenvia passos parados. Mesmo padrão do escritório
-- de posts (escritorio_*), com tabelas e segredo próprios.

alter table public.squad_projetos
  add column subpasso text,
  add column rascunho jsonb not null default '{}'::jsonb;
comment on column public.squad_projetos.subpasso is 'Passo dentro da etapa (ex.: ana_analisa, bruno_critica). Mudar etapa/subpasso dispara a esteira.';
comment on column public.squad_projetos.rascunho is 'Trabalho intermediário entre passos da esteira (análise da Ana, crítica do Bruno, PRD em revisão).';

insert into public.squad_config (chave, valor, descricao) values
  ('url_esteira', 'https://xtrvojnauvkkterogrst.supabase.co/functions/v1/squad-esteira', 'Edge Function que executa um passo da esteira'),
  ('segredo_interno', encode(extensions.gen_random_bytes(32), 'hex'), 'Segredo do header x-squad-interno (banco → esteira)');

-- Etapas que a esteira executa sozinha (as demais esperam o usuário ou ainda não existem).
create function public.squad_etapa_automatica(p_etapa text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_etapa in ('entrevista', 'prd');
$$;

create function public.squad_disparar_etapa(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_segredo text;
begin
  select valor into v_url from public.squad_config where chave = 'url_esteira';
  select valor into v_segredo from public.squad_config where chave = 'segredo_interno';
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-squad-interno', v_segredo),
    body := jsonb_build_object('id', p_id),
    timeout_milliseconds := 10000
  );
end;
$$;

create function public.squad_seguir_esteira()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.squad_etapa_automatica(new.etapa) and new.erro is null then
    perform public.squad_disparar_etapa(new.id);
  end if;
  return null;
end;
$$;

-- Só UPDATE: quem cria o projeto grava os eventos iniciais e depois liga a esteira.
create trigger squad_projetos_esteira
  after update of etapa, subpasso, erro on public.squad_projetos
  for each row execute function public.squad_seguir_esteira();

create function public.squad_reenviar_paradas()
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

revoke execute on function public.squad_disparar_etapa(uuid) from public, anon, authenticated;
revoke execute on function public.squad_seguir_esteira() from public, anon, authenticated;
revoke execute on function public.squad_reenviar_paradas() from public, anon, authenticated;

select cron.schedule('squad-reenviar-paradas', '*/2 * * * *', $$ select public.squad_reenviar_paradas(); $$);
