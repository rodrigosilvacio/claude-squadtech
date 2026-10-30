-- SquadTech · Fase 3 (Desenvolvimento e Delivery)
-- Novas etapas automáticas e configuração da entrega no GitHub.

create or replace function public.squad_etapa_automatica(p_etapa text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_etapa in ('entrevista', 'prd', 'arquitetura', 'migracao', 'planejamento', 'desenvolvimento', 'integracao', 'delivery');
$$;

insert into public.squad_config (chave, valor, descricao) values
  ('chave_publishable', 'sb_publishable_JmhdMN8S7lSpCeaJANw_lQ_RRwZ2_OT', 'Chave publishable gravada no js/config.js dos apps gerados (segura no navegador; acesso via RLS)'),
  ('github_repo', 'rodrigosilvacio/claude-squadtech', 'Repositório onde o Lucas faz o commit das entregas'),
  ('github_branch', 'main', 'Branch publicada no GitHub Pages'),
  ('url_pages_base', 'https://rodrigosilvacio.github.io/claude-squadtech', 'Endereço base do GitHub Pages')
on conflict (chave) do update set valor = excluded.valor, descricao = excluded.descricao;

-- Cada arquivo é gerado numa chamada ao modelo: 25 mil caracteres cabem com folga no tempo de uma invocação.
update public.squad_config set valor = '25000' where chave = 'max_caracteres_arquivo';
