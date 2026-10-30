-- SquadTech · Fase 2 (Sala de Arquitetura)
-- Etapas novas na esteira (arquitetura, migracao) e o executor seguro de SQL:
-- a esteira valida o SQL da Carla em TypeScript e, depois do Portão 2, chama
-- esta função, que valida de novo cada comando e aplica tudo numa transação só.

alter table public.squad_projetos add column prefixo_db text
  check (prefixo_db ~ '^sq_[a-z0-9_]+_$' and length(prefixo_db) <= 30);
comment on column public.squad_projetos.prefixo_db is 'Prefixo obrigatório das tabelas do app gerado (sq_<slug curto>_<4 hex do id>_).';

create or replace function public.squad_etapa_automatica(p_etapa text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_etapa in ('entrevista', 'prd', 'arquitetura', 'migracao');
$$;

-- Defesa em profundidade: mesmo chamado pela service role, só aceita comandos
-- de criação/alteração sobre objetos com o prefixo do projeto, sem funções,
-- sem DROP/GRANT e sem desligar RLS. Tudo ou nada (a função é uma transação).
create function public.squad_executar_migracao(p_prefixo text, p_comandos text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cmd text;
  v_limpo text;
  v_nome text;
  v_n integer := 0;
begin
  if p_prefixo !~ '^sq_[a-z0-9_]+_$' then
    raise exception 'prefixo inválido: %', p_prefixo;
  end if;
  if coalesce(array_length(p_comandos, 1), 0) = 0 or array_length(p_comandos, 1) > 80 then
    raise exception 'quantidade de comandos inválida';
  end if;

  foreach v_cmd in array p_comandos loop
    -- tira literais entre aspas simples antes de procurar palavras proibidas
    v_limpo := lower(regexp_replace(v_cmd, '''([^'']|'''')*''', '''''', 'g'));
    if v_limpo !~ '^\s*(create\s+table|alter\s+table|create\s+(unique\s+)?index|create\s+policy|insert\s+into|comment\s+on)\s' then
      raise exception 'comando não permitido: %', left(v_cmd, 120);
    end if;
    if v_limpo ~ '\m(drop|truncate|grant|revoke|function|procedure|trigger|execute|copy|definer|extension|schema|owner|rename|disable|vacuum)\M' then
      raise exception 'palavra proibida no comando: %', left(v_cmd, 120);
    end if;
    if v_limpo ~ '\m(storage|vault|cron|net|extensions|pg_catalog|information_schema|realtime|supabase_functions|graphql)\s*\.' then
      raise exception 'schema proibido no comando: %', left(v_cmd, 120);
    end if;
    -- auth.users é compartilhado com outros apps: só pode ser alvo de FK, nunca lido
    if v_limpo ~ '\m(from|join)\s+auth\s*\.' then
      raise exception 'leitura de auth.* não permitida: %', left(v_cmd, 120);
    end if;
    -- todo objeto public.* referenciado precisa ter o prefixo do projeto
    for v_nome in select m[1] from regexp_matches(v_limpo, 'public\s*\.\s*"?([a-z0-9_]+)', 'g') as m loop
      if left(v_nome, length(p_prefixo)) <> p_prefixo then
        raise exception 'objeto fora do prefixo %: public.%', p_prefixo, v_nome;
      end if;
    end loop;
    execute v_cmd;
    v_n := v_n + 1;
  end loop;

  -- toda tabela com o prefixo precisa estar com RLS ligado
  for v_nome in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and left(c.relname, length(p_prefixo)) = p_prefixo and not c.relrowsecurity
  loop
    raise exception 'tabela sem RLS: public.%', v_nome;
  end loop;
  return v_n;
end;
$$;

revoke execute on function public.squad_executar_migracao(text, text[]) from public, anon, authenticated;
grant execute on function public.squad_executar_migracao(text, text[]) to service_role;
