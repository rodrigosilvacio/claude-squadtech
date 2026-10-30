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
  tokens_entrada: number;
  tokens_saida: number;
}

export const CAMPOS_PROJETO = 'id, nome, slug, briefing, etapa, subpasso, rodada_po, rodada_arq, prefixo_db, rascunho, tokens_entrada, tokens_saida';

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

// Chamada ao Claude. `fallbacks: "default"` reenvia no servidor um pedido recusado
// pelos classificadores para o modelo recomendado. Com `formato`, a saída vem em JSON Schema.
async function chamar(p: Projeto, system: string, conteudo: string, effort: 'low' | 'medium', maxTokens: number, formato?: object) {
  const cfg = await config();
  if (p.tokens_entrada + p.tokens_saida > Number(cfg.teto_tokens_projeto)) {
    throw new Error('O projeto atingiu o teto de tokens configurado em squad_config.');
  }
  const resposta = await anthropic.beta.messages.create({
    model: cfg.modelo,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: conteudo }],
    output_config: formato ? { effort, format: { type: 'json_schema', schema: formato } } : { effort },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    // deno-lint-ignore no-explicit-any
  } as any);
  p.tokens_entrada += resposta.usage?.input_tokens ?? 0;
  p.tokens_saida += resposta.usage?.output_tokens ?? 0;
  await atualizar(p, { tokens_entrada: p.tokens_entrada, tokens_saida: p.tokens_saida });
  if (resposta.stop_reason === 'refusal') throw new Error('O modelo recusou este pedido. Revise o briefing e tente de novo.');
  // deno-lint-ignore no-explicit-any
  const texto = resposta.content.map((b: any) => (b.type === 'text' ? b.text : '')).join('');
  return { texto, cortada: resposta.stop_reason === 'max_tokens' };
}

export async function perguntar<T>(p: Projeto, system: string, conteudo: string, formato: object, effort: 'low' | 'medium', maxTokens: number): Promise<T> {
  const r = await chamar(p, system, conteudo, effort, maxTokens, formato);
  if (r.cortada) throw new Error('A resposta do modelo veio cortada (limite de tokens).');
  return JSON.parse(r.texto) as T;
}

// Saída em texto livre (código): sem o escape do JSON, cabe mais arquivo no mesmo limite.
export function perguntarTexto(p: Projeto, system: string, conteudo: string, effort: 'low' | 'medium', maxTokens: number) {
  return chamar(p, system, conteudo, effort, maxTokens);
}

// Último artefato de um tipo (opcionalmente só os aprovados).
export async function ultimoArtefato(p: Projeto, tipo: string, soAprovado = false) {
  let q = supabase.from('squad_artefatos').select('versao, conteudo, comentario, aprovado').eq('projeto_id', p.id).eq('tipo', tipo);
  if (soAprovado) q = q.eq('aprovado', true);
  const { data, error } = await q.order('versao', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data as { versao: number; conteudo: string; comentario: string | null; aprovado: boolean | null } | null;
}
