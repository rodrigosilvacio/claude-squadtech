-- SquadTech · Conta convidada
-- Um membro tem papel 'dono' (Rodrigo) ou 'convidado' (conta compartilhada para
-- testes). O convidado só vê os próprios projetos (RLS por user_id, já existente)
-- e cria com cota: limite_projetos_dia_convidado por dia e teto_tokens_convidado
-- por projeto. O teto vale por projeto (coluna teto_tokens) e é aplicado por
-- trigger: ao passar dele, o projeto ganha erro e a esteira para.

alter table public.squad_usuarios
  add column papel text not null default 'dono' check (papel in ('dono', 'convidado'));
comment on column public.squad_usuarios.papel is 'dono: sem cota extra; convidado: cota de projetos por dia e teto de tokens por projeto.';

alter table public.squad_projetos
  add column teto_tokens bigint;
comment on column public.squad_projetos.teto_tokens is 'Teto de tokens (entrada + saída) deste projeto; nulo usa só o teto global de squad_config.';

insert into public.squad_config (chave, valor, descricao) values
  ('limite_projetos_dia_convidado', '2', 'Projetos que a conta convidada pode criar em 24 horas'),
  ('teto_tokens_convidado', '1200000', 'Teto de tokens por projeto criado por convidado')
on conflict (chave) do update set valor = excluded.valor, descricao = excluded.descricao;

create function public.squad_aplicar_teto()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.teto_tokens is not null and new.erro is null
     and new.tokens_entrada + new.tokens_saida > new.teto_tokens then
    new.erro := format('O projeto atingiu o teto de %s mil tokens da conta convidada.', new.teto_tokens / 1000);
  end if;
  return new;
end;
$$;

create trigger squad_projetos_teto
  before update of tokens_entrada, tokens_saida, erro on public.squad_projetos
  for each row execute function public.squad_aplicar_teto();

revoke execute on function public.squad_aplicar_teto() from public, anon, authenticated;
