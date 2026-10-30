// Esteira do SquadTech: executa UM passo de um projeto e o avança. Quem chama é o
// banco (trigger/cron via pg_net, migration 0002) com o header x-squad-interno;
// o próximo passo é disparado pelo trigger quando etapa/subpasso mudam.
// Cada passo cabe numa invocação (~150s) e vira eventos em squad_eventos.
// Deploy com verify_jwt desligado (a autenticação é o segredo interno).
//
// Fase 1: Sala de Produto
//   entrevista: ana_analisa → bruno_critica → ana_pergunta → (aguardando_respostas | prd)
//   prd:        bruno_escreve → ana_revisa → [bruno_ajusta] → aguardando_aprovacao_prd
import Anthropic from 'npm:@anthropic-ai/sdk@0.137.0';
import { createClient } from 'npm:@supabase/supabase-js@2.110.5';
import {
  ANA, BRUNO, FORMATO_ANA_ANALISE, FORMATO_ANA_PERGUNTAS, FORMATO_ANA_REVISAO,
  FORMATO_BRUNO_AJUSTE, FORMATO_BRUNO_CRITICA, FORMATO_BRUNO_PRD,
} from './prompts.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY'), timeout: 120_000, maxRetries: 0 });

const ETAPAS_AUTOMATICAS = ['entrevista', 'prd'];
const MAX_PERGUNTAS = 5;

interface Projeto {
  id: string;
  nome: string;
  slug: string;
  briefing: string;
  etapa: string;
  subpasso: string | null;
  rodada_po: number;
  rascunho: Record<string, unknown>;
  tokens_entrada: number;
  tokens_saida: number;
}

// ---------- utilidades ----------

let configCache: Record<string, string> | null = null;
async function config(): Promise<Record<string, string>> {
  if (configCache) return configCache;
  const { data, error } = await supabase.from('squad_config').select('chave, valor');
  if (error) throw error;
  return (configCache = Object.fromEntries(data.map((l) => [l.chave, l.valor])));
}

function iguais(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

interface Extra { para?: string | null; sala?: string; dados?: Record<string, unknown> }
async function emitir(p: Projeto, tipo: string, agente: string | null, texto: string | null, extra: Extra = {}) {
  const { error } = await supabase.from('squad_eventos').insert({
    projeto_id: p.id, tipo, agente, para: extra.para ?? null, sala: extra.sala ?? 'produto',
    texto: texto?.slice(0, 600) ?? null, dados: extra.dados ?? {},
  });
  if (error) console.error('evento não gravado:', error.message);
}
const fala = (p: Projeto, agente: string, para: string, texto: string) => emitir(p, 'fala', agente, texto, { para });
const estado = (p: Projeto, agente: string, valor: string) => emitir(p, 'estado', agente, null, { dados: { estado: valor } });

async function atualizar(p: Projeto, campos: Record<string, unknown>) {
  const { error } = await supabase.from('squad_projetos').update(campos).eq('id', p.id);
  if (error) throw error;
}

// Chamada ao Claude com saída estruturada. `fallbacks: "default"` reenvia no servidor
// um pedido recusado pelos classificadores para o modelo recomendado.
async function perguntar<T>(p: Projeto, system: string, conteudo: string, formato: object, effort: 'low' | 'medium', maxTokens: number): Promise<T> {
  const cfg = await config();
  if (p.tokens_entrada + p.tokens_saida > Number(cfg.teto_tokens_projeto)) {
    throw new Error('O projeto atingiu o teto de tokens configurado em squad_config.');
  }
  const resposta = await anthropic.beta.messages.create({
    model: cfg.modelo,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: conteudo }],
    output_config: { effort, format: { type: 'json_schema', schema: formato } },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    // deno-lint-ignore no-explicit-any
  } as any);
  p.tokens_entrada += resposta.usage?.input_tokens ?? 0;
  p.tokens_saida += resposta.usage?.output_tokens ?? 0;
  await atualizar(p, { tokens_entrada: p.tokens_entrada, tokens_saida: p.tokens_saida });
  if (resposta.stop_reason === 'refusal') throw new Error('O modelo recusou este pedido. Revise o briefing e tente de novo.');
  if (resposta.stop_reason === 'max_tokens') throw new Error('A resposta do modelo veio cortada (limite de tokens).');
  // deno-lint-ignore no-explicit-any
  const texto = resposta.content.map((b: any) => (b.type === 'text' ? b.text : '')).join('');
  return JSON.parse(texto) as T;
}

// Briefing + todas as rodadas de perguntas e respostas + ajustes pedidos no PRD.
// Os ajustes vêm depois da entrevista e prevalecem sobre ela.
async function contexto(p: Projeto): Promise<string> {
  const { data, error } = await supabase.from('squad_artefatos')
    .select('tipo, versao, conteudo, comentario').eq('projeto_id', p.id).in('tipo', ['respostas', 'prd']).order('versao');
  if (error) throw error;
  const rodadas = data.filter((a) => a.tipo === 'respostas').map((a) => `Rodada ${a.versao}:\n${a.conteudo}`).join('\n\n');
  const ajustes = data.filter((a) => a.tipo === 'prd' && a.comentario).map((a) => `- Sobre o PRD v${a.versao}: ${a.comentario}`).join('\n');
  return `<briefing>\nNome do projeto: ${p.nome}\n\n${p.briefing}\n</briefing>\n\n<entrevista>\n${rodadas || 'Ainda não houve perguntas ao cliente.'}${ajustes ? `\n\nAjustes que o cliente pediu depois, ao revisar o PRD. São as decisões mais recentes e prevalecem sobre as respostas acima:\n${ajustes}` : ''}\n</entrevista>`;
}

const listar = (itens: string[]) => (itens.length ? itens.map((i) => `- ${i}`).join('\n') : '- nenhuma');

async function ultimoPrd(p: Projeto): Promise<{ versao: number; conteudo: string; comentario: string | null } | null> {
  const { data, error } = await supabase.from('squad_artefatos')
    .select('versao, conteudo, comentario').eq('projeto_id', p.id).eq('tipo', 'prd')
    .order('versao', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

// ---------- Sala 1: entrevista ----------

interface Analise { fala_para_bruno: string; lacunas: string[]; suficiente: boolean; fora_do_escopo: boolean; motivo_fora_do_escopo: string }
interface Critica { fala_para_ana: string; lacunas_adicionais: string[]; concorda_suficiente: boolean }
interface Perguntas { suficiente: boolean; fala_para_bruno: string; fala_para_usuario: string; perguntas: { pergunta: string; porque: string; sugestao: string }[]; premissas: string[] }

async function anaAnalisa(p: Projeto) {
  await estado(p, 'ana', 'lendo');
  const r = await perguntar<Analise>(p, ANA, `${await contexto(p)}\n\nTarefa: analise o briefing${p.rodada_po > 1 ? ' e as respostas do cliente' : ''}. Liste as lacunas que ainda impedem um bom PRD, diga se o contexto já é suficiente e se o pedido está fora do escopo. Em "fala_para_bruno", conte ao Bruno o que você entendeu e o que falta.`, FORMATO_ANA_ANALISE, 'low', 3000);
  await fala(p, 'ana', 'bruno', r.fala_para_bruno);
  if (r.fora_do_escopo) {
    await fala(p, 'ana', 'usuario', r.motivo_fora_do_escopo);
    await atualizar(p, { etapa: 'escalado', subpasso: null, passo_em: null, pendencias: r.motivo_fora_do_escopo });
    await emitir(p, 'fim', 'ana', 'Projeto encerrado: fora do escopo do SquadTech', { dados: { escalado: true, resumo: r.motivo_fora_do_escopo } });
    return;
  }
  await atualizar(p, { subpasso: 'bruno_critica', passo_em: null, tentativas: 0, rascunho: { analise: r } });
}

async function brunoCritica(p: Projeto) {
  const analise = p.rascunho.analise as Analise;
  await estado(p, 'bruno', 'pensando');
  const r = await perguntar<Critica>(p, BRUNO, `${await contexto(p)}\n\nAnálise da Ana:\nLacunas:\n${listar(analise.lacunas)}\nEla acha que o contexto ${analise.suficiente ? 'já é suficiente' : 'ainda não é suficiente'}.\n\nTarefa: critique a análise antes de falarmos com o cliente. O que faria o PRD falhar? Aponte só lacunas novas e relevantes (métrica de sucesso, regras de negócio, perfis de usuário, volume, dados pessoais). Diga se concorda que já dá para escrever o PRD. Em "fala_para_ana", responda à Ana.`, FORMATO_BRUNO_CRITICA, 'low', 2500);
  await fala(p, 'bruno', 'ana', r.fala_para_ana);
  await atualizar(p, { subpasso: 'ana_pergunta', passo_em: null, tentativas: 0, rascunho: { ...p.rascunho, critica: r } });
}

async function anaPergunta(p: Projeto) {
  const cfg = await config();
  const analise = p.rascunho.analise as Analise;
  const critica = p.rascunho.critica as Critica;
  const ultima = p.rodada_po >= Number(cfg.max_rodadas_perguntas);
  await estado(p, 'ana', 'digitando');
  const r = await perguntar<Perguntas>(p, ANA, `${await contexto(p)}\n\nSuas lacunas:\n${listar(analise.lacunas)}\nLacunas do Bruno:\n${listar(critica.lacunas_adicionais)}\nO Bruno ${critica.concorda_suficiente ? 'concorda' : 'não concorda'} que já dá para escrever o PRD.\n\nTarefa: decida. Se ainda faltar algo importante, escreva até ${MAX_PERGUNTAS} perguntas ao cliente (rodada ${p.rodada_po}). Se o contexto for suficiente, marque "suficiente" e deixe "perguntas" vazia. ${ultima ? 'ATENÇÃO: esta é a última rodada permitida. Marque "suficiente" e transforme as lacunas restantes em premissas razoáveis.' : ''} Em "premissas", liste o que o squad vai assumir. "fala_para_bruno" fecha a conversa com o Bruno; "fala_para_usuario" fala com o cliente (apresenta as perguntas ou avisa que o PRD vai ser escrito).`, FORMATO_ANA_PERGUNTAS, 'low', 4000);
  await fala(p, 'ana', 'bruno', r.fala_para_bruno);
  const perguntas = r.perguntas.slice(0, MAX_PERGUNTAS);

  if (r.suficiente || ultima || perguntas.length === 0) {
    await fala(p, 'ana', 'usuario', r.fala_para_usuario);
    await atualizar(p, { etapa: 'prd', subpasso: 'bruno_escreve', passo_em: null, tentativas: 0, rascunho: { premissas: r.premissas } });
    return;
  }

  const md = perguntas.map((q, i) => `${i + 1}. **${q.pergunta}**  \n_${q.porque}_`).join('\n\n');
  const { error } = await supabase.from('squad_artefatos').insert({ projeto_id: p.id, tipo: 'perguntas', versao: p.rodada_po, conteudo: md, autor: 'ana' });
  if (error) throw error;
  await emitir(p, 'artefato', 'ana', null, { dados: { tipo: 'perguntas', titulo: `Perguntas da Ana (rodada ${p.rodada_po})`, autor: 'ana', conteudo: md, versao: p.rodada_po } });
  await fala(p, 'ana', 'usuario', r.fala_para_usuario);
  await atualizar(p, { etapa: 'aguardando_respostas', subpasso: null, passo_em: null, tentativas: 0, rascunho: { premissas: r.premissas, perguntas } });
  await emitir(p, 'portao', 'ana', null, {
    dados: {
      tipo: 'perguntas', rodada: p.rodada_po, titulo: `Perguntas da Ana (rodada ${p.rodada_po})`, subtitulo: 'Sala 1 · Produto',
      intro: 'Responda com o máximo de contexto. A sugestão já vem preenchida: ajuste o que quiser ou marque "Decida você".',
      perguntas,
    },
  });
}

// ---------- Sala 1: PRD ----------

interface Prd { prd_markdown: string; fala_para_ana: string }
interface Revisao { aprovado: boolean; pontos: { trecho: string; problema: string; sugestao: string }[]; fala_para_bruno: string }

async function brunoEscreve(p: Projeto) {
  const premissas = (p.rascunho.premissas as string[] | undefined) ?? [];
  const anterior = await ultimoPrd(p);
  const comentario = p.rascunho.comentario as string | undefined;
  const versao = (anterior?.versao ?? 0) + 1;
  await estado(p, 'bruno', 'digitando');
  let pedido = `${await contexto(p)}\n\nPremissas do squad:\n${listar(premissas)}\n\nData de hoje: ${new Date().toLocaleDateString('pt-BR')}.\n\n`;
  if (anterior && comentario) {
    pedido += `<prd>\n${anterior.conteudo}\n</prd>\n\nO cliente pediu ajustes no PRD v${anterior.versao}:\n"${comentario}"\n\nTarefa: escreva o PRD v${versao} aplicando o ajuste. Mude só o necessário e mantenha o resto. Em "fala_para_ana", diga o que mudou.`;
  } else {
    pedido += `Tarefa: escreva o PRD v${versao} completo. Em "fala_para_ana", peça a revisão dela destacando a decisão de escopo mais importante.`;
  }
  const r = await perguntar<Prd>(p, BRUNO, pedido, FORMATO_BRUNO_PRD, 'low', 12000);
  await fala(p, 'bruno', 'ana', r.fala_para_ana);
  await atualizar(p, { subpasso: 'ana_revisa', passo_em: null, tentativas: 0, rascunho: { ...p.rascunho, prd: r.prd_markdown, versao } });
}

async function anaRevisa(p: Projeto) {
  await estado(p, 'ana', 'lendo');
  const r = await perguntar<Revisao>(p, ANA, `${await contexto(p)}\n\n<prd>\n${p.rascunho.prd}\n</prd>\n\nTarefa: revise o PRD do Bruno contra o que o cliente disse. Reprove só por problema real: requisito que contradiz o cliente, métrica de sucesso ausente, critério de aceite que não dá para testar, escopo fora da stack, dado pessoal sem cuidado de LGPD. Para cada problema, cite o trecho, o problema e a correção. Em "fala_para_bruno", dê o parecer.`, FORMATO_ANA_REVISAO, 'medium', 3000);
  await fala(p, 'ana', 'bruno', r.fala_para_bruno);
  // Mesmo aprovando, a Ana costuma pedir detalhes: o Bruno aplica antes de publicar.
  if (r.pontos.length === 0) {
    await publicarPrd(p, p.rascunho.prd as string);
    return;
  }
  await atualizar(p, { subpasso: 'bruno_ajusta', passo_em: null, tentativas: 0, rascunho: { ...p.rascunho, revisao: r } });
}

async function brunoAjusta(p: Projeto) {
  const rev = p.rascunho.revisao as Revisao;
  await estado(p, 'bruno', 'digitando');
  const pontos = rev.pontos.map((x, i) => `${i + 1}. Trecho: "${x.trecho}" | Problema: ${x.problema} | Correção: ${x.sugestao}`).join('\n');
  const r = await perguntar<Prd>(p, BRUNO, `${await contexto(p)}\n\n<prd>\n${p.rascunho.prd}\n</prd>\n\nApontamentos da Ana:\n${pontos}\n\nTarefa: corrija todos os apontamentos e devolva o PRD completo. Em "fala_para_ana", confirme o que mudou.`, FORMATO_BRUNO_AJUSTE, 'low', 12000);
  await fala(p, 'bruno', 'ana', r.fala_para_ana);
  await publicarPrd(p, r.prd_markdown);
}

async function publicarPrd(p: Projeto, prd: string) {
  const versao = p.rascunho.versao as number;
  const { error } = await supabase.from('squad_artefatos').insert({ projeto_id: p.id, tipo: 'prd', versao, conteudo: prd, autor: 'bruno' });
  if (error) throw error;
  await emitir(p, 'artefato', 'bruno', null, { dados: { tipo: 'prd', titulo: 'PRD', autor: 'bruno', conteudo: prd, versao } });
  await fala(p, 'bruno', 'usuario', `PRD v${versao} pronto. Preciso da sua aprovação para seguir para a Arquitetura.`);
  await atualizar(p, { etapa: 'aguardando_aprovacao_prd', subpasso: null, passo_em: null, tentativas: 0, rascunho: { premissas: p.rascunho.premissas ?? [] } });
  await emitir(p, 'portao', 'bruno', null, {
    dados: { tipo: 'prd', versao, titulo: `Aprovar PRD (v${versao})`, subtitulo: 'Portão 1 · nada avança sem a sua decisão', conteudo: prd },
  });
}

// ---------- execução ----------

const PASSOS: Record<string, Record<string, (p: Projeto) => Promise<void>>> = {
  entrevista: { ana_analisa: anaAnalisa, bruno_critica: brunoCritica, ana_pergunta: anaPergunta },
  prd: { bruno_escreve: brunoEscreve, ana_revisa: anaRevisa, bruno_ajusta: brunoAjusta },
};
const PRIMEIRO: Record<string, string> = { entrevista: 'ana_analisa', prd: 'bruno_escreve' };
const AGENTE_DO_PASSO: Record<string, string> = {
  ana_analisa: 'ana', bruno_critica: 'bruno', ana_pergunta: 'ana', bruno_escreve: 'bruno', ana_revisa: 'ana', bruno_ajusta: 'bruno',
};

async function executar(id: string) {
  // Trava o passo: só uma invocação por vez (a trava expira em 4 min, igual ao cron).
  const limite = new Date(Date.now() - 4 * 60_000).toISOString();
  const { data, error } = await supabase
    .from('squad_projetos')
    .update({ passo_em: new Date().toISOString() })
    .eq('id', id)
    .in('etapa', ETAPAS_AUTOMATICAS)
    .is('erro', null)
    .or(`passo_em.is.null,passo_em.lt.${limite}`)
    .select('id, nome, slug, briefing, etapa, subpasso, rodada_po, rascunho, tokens_entrada, tokens_saida')
    .maybeSingle();
  if (error) throw error;
  if (!data) return;
  const p = data as Projeto;
  const subpasso = p.subpasso ?? PRIMEIRO[p.etapa];
  const passo = PASSOS[p.etapa]?.[subpasso];
  try {
    if (!passo) throw new Error(`Passo desconhecido: ${p.etapa}/${subpasso}`);
    await passo(p);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`passo ${p.etapa}/${subpasso} do projeto ${p.id} falhou:`, msg);
    await atualizar(p, { erro: msg.slice(0, 500), passo_em: null });
    const agente = AGENTE_DO_PASSO[subpasso] ?? null;
    if (agente) await estado(p, agente, 'erro');
    await emitir(p, 'sistema', null, `A esteira parou: ${msg.slice(0, 200)}. Use "Retomar" para tentar de novo.`, { dados: { erro: true } });
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('use POST', { status: 405 });
  const cfg = await config();
  if (!iguais(req.headers.get('x-squad-interno') ?? '', cfg.segredo_interno)) {
    return new Response('não autorizado', { status: 401 });
  }
  const { id } = await req.json().catch(() => ({}));
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) return new Response('id inválido', { status: 400 });
  // Responde na hora (o pg_net não espera) e trabalha em segundo plano.
  EdgeRuntime.waitUntil(executar(id).catch((e) => console.error('falha na esteira:', e)));
  return new Response(JSON.stringify({ ok: true }), { status: 202, headers: { 'Content-Type': 'application/json' } });
});
