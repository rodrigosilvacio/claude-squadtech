// Núcleo da esteira: cliente do banco, configuração, eventos e chamada ao Claude.
import Anthropic from 'npm:@anthropic-ai/sdk@0.137.0';
import { createClient } from 'npm:@supabase/supabase-js@2.110.5';

export const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY'), timeout: 120_000, maxRetries: 0 });

export interface Projeto {
  id: string;
  nome: string;
  slug: string;
  briefing: string;
  etapa: string;
  subpasso: string | null;
  rodada_po: number;
  rodada_arq: number;
  prefixo_db: string | null;
  rascunho: Record<string, unknown>;
  rodada_qa: number;
  ciclo: number;
  tokens_entrada: number;
  tokens_saida: number;
  tokens_cache: number;
}

export const CAMPOS_PROJETO = 'id, nome, slug, briefing, etapa, subpasso, rodada_po, rodada_arq, rodada_qa, ciclo, prefixo_db, rascunho, tokens_entrada, tokens_saida, tokens_cache';

const SALA_DO_AGENTE: Record<string, string> = {
  ana: 'produto', bruno: 'produto',
  carla: 'arquitetura', diego: 'arquitetura',
  eduardo: 'desenvolvimento', fernanda: 'desenvolvimento', gabriel: 'desenvolvimento', helena: 'desenvolvimento',
  igor: 'testes', julia: 'testes',
  lucas: 'delivery',
};

let configCache: Record<string, string> | null = null;
export async function config(): Promise<Record<string, string>> {
  if (configCache) return configCache;
  const { data, error } = await supabase.from('squad_config').select('chave, valor');
  if (error) throw error;
  return (configCache = Object.fromEntries(data.map((l) => [l.chave, l.valor])));
}

interface Extra { para?: string | null; sala?: string; dados?: Record<string, unknown> }
export async function emitir(p: Projeto, tipo: string, agente: string | null, texto: string | null, extra: Extra = {}) {
  const { error } = await supabase.from('squad_eventos').insert({
    projeto_id: p.id, tipo, agente, para: extra.para ?? null,
    sala: extra.sala ?? (agente ? SALA_DO_AGENTE[agente] : null) ?? 'produto',
    texto: texto?.slice(0, 600) ?? null, dados: extra.dados ?? {},
  });
  if (error) console.error('evento não gravado:', error.message);
}
export const fala = (p: Projeto, agente: string, para: string, texto: string) => emitir(p, 'fala', agente, texto, { para });
export const estado = (p: Projeto, agente: string, valor: string) => emitir(p, 'estado', agente, null, { dados: { estado: valor } });

export async function atualizar(p: Projeto, campos: Record<string, unknown>) {
  const { error } = await supabase.from('squad_projetos').update(campos).eq('id', p.id);
  if (error) throw error;
}

export const listar = (itens: string[]) => (itens.length ? itens.map((i) => `- ${i}`).join('\n') : '- nenhuma');

// System: texto simples, ou o contexto do projeto (PRD, arquitetura, regras e
// contrato, igual para todos os agentes) seguido da persona. O contexto vai com
// cache_control: as chamadas seguintes do mesmo projeto leem do cache (~5% do preço).
export type Sistema = string | { contexto: string; persona: string };
// Conteúdo: texto, ou blocos em que `cache` marca o fim de um prefixo estável
// (ex.: o código dos colegas, que só cresce de um arquivo para o outro).
export type Conteudo = string | { texto: string; cache?: boolean }[];

const CACHE = { type: 'ephemeral' } as const;

function montarSystem(s: Sistema) {
  if (typeof s === 'string') return s;
  return [{ type: 'text', text: s.contexto, cache_control: CACHE }, { type: 'text', text: s.persona }];
}

function montarConteudo(c: Conteudo) {
  if (typeof c === 'string') return c;
  return c.filter((b) => b.texto).map((b) => (b.cache ? { type: 'text', text: b.texto, cache_control: CACHE } : { type: 'text', text: b.texto }));
}

// Chamada ao Claude. `fallbacks: "default"` reenvia no servidor um pedido recusado
// pelos classificadores para o modelo recomendado. Com `formato`, a saída vem em JSON Schema.
async function chamar(p: Projeto, system: Sistema, conteudo: Conteudo, effort: 'low' | 'medium', maxTokens: number, formato?: object) {
  const cfg = await config();
  if (p.tokens_entrada + p.tokens_saida > Number(cfg.teto_tokens_projeto)) {
    throw new Error('O projeto atingiu o teto de tokens configurado em squad_config.');
  }
  const resposta = await anthropic.beta.messages.create({
    model: cfg.modelo,
    max_tokens: maxTokens,
    system: montarSystem(system),
    messages: [{ role: 'user', content: montarConteudo(conteudo) }],
    output_config: formato ? { effort, format: { type: 'json_schema', schema: formato } } : { effort },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    // deno-lint-ignore no-explicit-any
  } as any);
  // Entrada = o que pagou preço cheio ou de escrita no cache; leituras do cache contam à parte.
  const u = resposta.usage ?? {};
  p.tokens_entrada += (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
  p.tokens_saida += u.output_tokens ?? 0;
  p.tokens_cache += u.cache_read_input_tokens ?? 0;
  await atualizar(p, { tokens_entrada: p.tokens_entrada, tokens_saida: p.tokens_saida, tokens_cache: p.tokens_cache });
  if (resposta.stop_reason === 'refusal') throw new Error('O modelo recusou este pedido. Revise o briefing e tente de novo.');
  // deno-lint-ignore no-explicit-any
  const texto = resposta.content.map((b: any) => (b.type === 'text' ? b.text : '')).join('');
  return { texto, cortada: resposta.stop_reason === 'max_tokens' };
}

export async function perguntar<T>(p: Projeto, system: Sistema, conteudo: Conteudo, formato: object, effort: 'low' | 'medium', maxTokens: number): Promise<T> {
  const r = await chamar(p, system, conteudo, effort, maxTokens, formato);
  if (r.cortada) throw new Error('A resposta do modelo veio cortada (limite de tokens).');
  return JSON.parse(r.texto) as T;
}

// Saída em texto livre (código): sem o escape do JSON, cabe mais arquivo no mesmo limite.
export function perguntarTexto(p: Projeto, system: Sistema, conteudo: Conteudo, effort: 'low' | 'medium', maxTokens: number) {
  return chamar(p, system, conteudo, effort, maxTokens);
}

// Pedido de evolução do ciclo atual (ciclo > 1), guardado como briefing "ajuste-<ciclo>".
export async function pedidoDeAjuste(p: Projeto): Promise<string | null> {
  if (p.ciclo <= 1) return null;
  const { data } = await supabase.from('squad_artefatos').select('conteudo').eq('projeto_id', p.id)
    .eq('tipo', 'briefing').eq('caminho', `ajuste-${p.ciclo}`).maybeSingle();
  return data?.conteudo ?? null;
}

// Último artefato de um tipo (opcionalmente só os aprovados).
export async function ultimoArtefato(p: Projeto, tipo: string, soAprovado = false) {
  let q = supabase.from('squad_artefatos').select('versao, conteudo, comentario, aprovado').eq('projeto_id', p.id).eq('tipo', tipo);
  if (soAprovado) q = q.eq('aprovado', true);
  const { data, error } = await q.order('versao', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data as { versao: number; conteudo: string; comentario: string | null; aprovado: boolean | null } | null;
}
