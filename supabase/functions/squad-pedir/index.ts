// Pedidos ao SquadTech feitos pelo escritório (usuário logado no Supabase Auth e
// presente em squad_usuarios; deploy com verify_jwt ligado).
//  - { acao: "criar", nome, briefing }             cria o projeto e liga a esteira
//  - { acao: "responder", id, respostas: [...] }   respostas às perguntas da Ana
//  - { acao: "decidir", id, portao: "prd" | "arquitetura", aprovado, comentario? }
//  - { acao: "retomar", id }                       reabre um passo que parou
//  - { acao: "testes", id, rodada, testes | pulado } resultado dos testes que o navegador rodou
// Toda escrita usa a service role; o navegador só lê (RLS).
import { createClient } from 'npm:@supabase/supabase-js@2.110.5';

const servico = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ETAPAS_AUTOMATICAS = ['entrevista', 'prd', 'arquitetura', 'migracao', 'planejamento', 'desenvolvimento', 'integracao', 'testes', 'delivery'];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

class Recusa extends Error {
  constructor(msg: string, public status = 400) { super(msg); }
}

async function config(): Promise<Record<string, string>> {
  const { data, error } = await servico.from('squad_config').select('chave, valor');
  if (error) throw error;
  return Object.fromEntries(data.map((l) => [l.chave, l.valor]));
}

async function evento(projeto_id: string, tipo: string, campos: Record<string, unknown> = {}) {
  const { error } = await servico.from('squad_eventos').insert({ projeto_id, tipo, sala: 'produto', ...campos });
  if (error) console.error('evento não gravado:', error.message);
}

function slugificar(nome: string): string {
  return nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '') || 'projeto';
}

async function slugLivre(base: string): Promise<string> {
  const { data, error } = await servico.from('squad_projetos').select('slug').like('slug', `${base}%`);
  if (error) throw error;
  const usados = new Set(data.map((l) => l.slug));
  if (!usados.has(base)) return base;
  for (let n = 2; ; n++) if (!usados.has(`${base}-${n}`)) return `${base}-${n}`;
}

async function projetoDoUsuario(userId: string, id: unknown) {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) throw new Recusa('Projeto inválido.');
  const { data, error } = await servico.from('squad_projetos').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data || data.user_id !== userId) throw new Recusa('Projeto não encontrado.', 404);
  return data;
}

// ---------- ações ----------

async function criar(userId: string, corpo: Record<string, unknown>) {
  const nome = String(corpo.nome ?? '').trim();
  const briefing = String(corpo.briefing ?? '').trim();
  if (nome.length < 3 || nome.length > 120) throw new Recusa('Dê um nome ao projeto (3 a 120 caracteres).');
  if (briefing.length < 30) throw new Recusa('Conte um pouco mais no briefing (pelo menos 30 caracteres).');
  if (briefing.length > 6000) throw new Recusa('O briefing passou de 6000 caracteres.');

  const cfg = await config();
  const desde = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count } = await servico.from('squad_projetos').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('criado_em', desde);
  if ((count ?? 0) >= Number(cfg.limite_projetos_dia)) {
    throw new Recusa(`Limite de ${cfg.limite_projetos_dia} projetos em 24 horas atingido.`, 429);
  }

  const slug = await slugLivre(slugificar(nome));
  const { data: p, error } = await servico.from('squad_projetos')
    .insert({ user_id: userId, nome, slug, briefing, etapa: 'entrevista' }).select('id, nome, slug').single();
  if (error) throw error;

  await servico.from('squad_artefatos').insert({ projeto_id: p.id, tipo: 'briefing', conteudo: `# Briefing\n\n**${nome}**\n\n${briefing}` });
  await evento(p.id, 'sistema', { texto: `Novo projeto: ${nome}` });
  await evento(p.id, 'artefato', { dados: { tipo: 'briefing', titulo: 'Briefing do cliente', conteudo: `# Briefing\n\n**${nome}**\n\n${briefing}` } });
  await evento(p.id, 'fase', { texto: 'Sala 1 · Produto recebe o briefing' });
  // Liga a esteira por último (o trigger só olha UPDATE), para os eventos acima virem primeiro.
  const { error: e2 } = await servico.from('squad_projetos').update({ subpasso: 'ana_analisa' }).eq('id', p.id);
  if (e2) throw e2;
  return json(p, 201);
}

async function responder(userId: string, corpo: Record<string, unknown>) {
  const p = await projetoDoUsuario(userId, corpo.id);
  if (p.etapa !== 'aguardando_respostas') throw new Recusa('Este projeto não está esperando respostas.', 409);
  const perguntas = (p.rascunho?.perguntas ?? []) as { pergunta: string }[];
  const respostas = Array.isArray(corpo.respostas) ? corpo.respostas : [];
  if (respostas.length !== perguntas.length) throw new Recusa('Responda todas as perguntas (ou marque "Decida você").');

  const md = perguntas.map((q, i) => {
    const r = respostas[i]?.resposta;
    const texto = typeof r === 'string' && r.trim() ? r.trim().slice(0, 1500) : null;
    return `${i + 1}. **${q.pergunta}**  \n${texto ?? '_O cliente delegou: decida você._'}`;
  }).join('\n\n');

  const { error } = await servico.from('squad_artefatos').insert({ projeto_id: p.id, tipo: 'respostas', versao: p.rodada_po, conteudo: md, autor: null });
  if (error) throw error;
  await evento(p.id, 'artefato', { dados: { tipo: 'respostas', titulo: `Suas respostas (rodada ${p.rodada_po})`, conteudo: md, versao: p.rodada_po } });
  const { error: e2 } = await servico.from('squad_projetos').update({
    etapa: 'entrevista', subpasso: 'ana_analisa', rodada_po: p.rodada_po + 1,
    rascunho: { premissas: p.rascunho?.premissas ?? [] }, passo_em: null, tentativas: 0,
  }).eq('id', p.id);
  if (e2) throw e2;
  return json({ ok: true });
}

// Portões 1 (PRD) e 2 (arquitetura): aprovar avança; pedir ajustes volta para a dupla da sala.
const PORTOES: Record<string, { etapa: string; tipo: string; nome: string; voltaPara: [string, string] }> = {
  prd: { etapa: 'aguardando_aprovacao_prd', tipo: 'prd', nome: 'o PRD', voltaPara: ['prd', 'bruno_escreve'] },
  arquitetura: { etapa: 'aguardando_aprovacao_arquitetura', tipo: 'arquitetura', nome: 'a arquitetura', voltaPara: ['arquitetura', 'carla_propoe'] },
};

async function decidir(userId: string, corpo: Record<string, unknown>) {
  const p = await projetoDoUsuario(userId, corpo.id);
  const portao = PORTOES[String(corpo.portao)];
  if (!portao) throw new Recusa('Portão desconhecido.');
  if (p.etapa !== portao.etapa) throw new Recusa(`Este projeto não está esperando aprovação d${portao.nome}.`, 409);
  const aprovado = corpo.aprovado === true;
  const comentario = String(corpo.comentario ?? '').trim().slice(0, 2000);
  if (!aprovado && comentario.length < 5) throw new Recusa(`Descreva o ajuste que você quer n${portao.nome}.`);

  const { data: doc, error } = await servico.from('squad_artefatos').select('id, versao')
    .eq('projeto_id', p.id).eq('tipo', portao.tipo).order('versao', { ascending: false }).limit(1).single();
  if (error) throw error;
  // O plano (arquivos, SQL, tarefas) é aprovado junto com o documento da arquitetura.
  await servico.from('squad_artefatos').update({ aprovado, comentario: comentario || null })
    .eq('projeto_id', p.id).in('tipo', portao.tipo === 'arquitetura' ? ['arquitetura', 'plano', 'sql'] : ['prd']).eq('versao', doc.versao);
  const sala = portao.tipo === 'prd' ? 'produto' : 'arquitetura';

  if (!aprovado) {
    await evento(p.id, 'sistema', { sala, texto: `Você pediu ajustes n${portao.nome} v${doc.versao}: "${comentario}"` });
    const [etapa, subpasso] = portao.voltaPara;
    const rascunho = portao.tipo === 'prd' ? { premissas: p.rascunho?.premissas ?? [], comentario } : { comentario };
    const { error: e2 } = await servico.from('squad_projetos').update({ etapa, subpasso, passo_em: null, tentativas: 0, rascunho }).eq('id', p.id);
    if (e2) throw e2;
    return json({ ok: true });
  }

  if (portao.tipo === 'prd') {
    await evento(p.id, 'sistema', { texto: `Você aprovou o PRD v${doc.versao}` });
    await evento(p.id, 'fala', { agente: 'bruno', para: 'ana', texto: 'PRD aprovado! Vou levar para a Arquitetura.' });
    await evento(p.id, 'handoff', { agente: 'bruno', para: 'carla', texto: `Carla, aqui está o PRD v${doc.versao} aprovado pelo cliente.`, dados: { artefato: 'o PRD' } });
    await evento(p.id, 'fase', { sala: 'arquitetura', texto: 'Sala 2 · Arquitetura recebe o PRD' });
    const { error: e2 } = await servico.from('squad_projetos').update({ etapa: 'arquitetura', subpasso: 'carla_propoe', passo_em: null, tentativas: 0, rascunho: {} }).eq('id', p.id);
    if (e2) throw e2;
    return json({ ok: true });
  }

  await evento(p.id, 'sistema', { sala, texto: `Você aprovou a arquitetura v${doc.versao}` });
  await evento(p.id, 'fala', { sala, agente: 'carla', para: 'diego', texto: 'Arquitetura aprovada! Diego, pode aplicar a migração.' });
  const { error: e2 } = await servico.from('squad_projetos').update({ etapa: 'migracao', subpasso: 'diego_aplica', passo_em: null, tentativas: 0, rascunho: {} }).eq('id', p.id);
  if (e2) throw e2;
  return json({ ok: true });
}

async function retomar(userId: string, corpo: Record<string, unknown>) {
  const p = await projetoDoUsuario(userId, corpo.id);
  if (!ETAPAS_AUTOMATICAS.includes(p.etapa)) throw new Recusa('Este projeto não está numa etapa automática.', 409);
  if (p.subpasso === 'navegador' && !p.erro) throw new Recusa('Os testes esperam o navegador: deixe o SquadTech aberto neste projeto.', 409);
  const parado = Date.now() - new Date(p.passo_em ?? p.atualizado_em).getTime() > 3 * 60_000;
  if (!p.erro && !parado) throw new Recusa('O squad ainda está trabalhando neste passo.', 409);
  await evento(p.id, 'sistema', { texto: 'Esteira retomada' });
  // Mudar `erro` dispara o trigger, que reenvia o passo atual para a esteira.
  const { error } = await servico.from('squad_projetos').update({ erro: null, passo_em: null, tentativas: 0 }).eq('id', p.id);
  if (error) throw error;
  return json({ ok: true });
}

// Resultado dos testes do Igor no navegador. O texto vem do app gerado, então é
// limitado e tratado como dado; quem interpreta é o Igor na esteira.
const corta = (v: unknown, n: number) => String(v ?? '').slice(0, n);

async function testes(userId: string, corpo: Record<string, unknown>) {
  const p = await projetoDoUsuario(userId, corpo.id);
  if (p.etapa !== 'testes' || p.subpasso !== 'navegador') throw new Recusa('Este projeto não está esperando os testes do navegador.', 409);
  if (Number(corpo.rodada) !== p.rodada_qa) throw new Recusa('Esta rodada de testes já foi registrada.', 409);
  const pulado = corpo.pulado === true;
  const lista = Array.isArray(corpo.testes) ? corpo.testes.slice(0, 15) : [];
  if (!pulado && !lista.length) throw new Recusa('Nenhum resultado de teste recebido.');
  const resultados = lista.map((t: Record<string, unknown>) => ({
    id: corta(t.id, 20), nome: corta(t.nome, 160), ok: t.ok === true,
    erro: corta(t.erro, 400), passo: Number.isInteger(t.passo) ? t.passo : null,
    console: (Array.isArray(t.console) ? t.console : []).slice(0, 8).map((c: unknown) => corta(c, 300)),
    tela: corta(t.tela, 1500), ms: Number(t.ms) || 0,
  }));
  const ok = resultados.filter((t) => t.ok).length;
  const aprovado = !pulado && ok === resultados.length;
  const { error } = await servico.from('squad_testes').insert({ projeto_id: p.id, rodada: p.rodada_qa, origem: 'navegador', aprovado, resultado: { pulado, testes: resultados } });
  if (error) throw error;
  await evento(p.id, 'sistema', {
    sala: 'testes',
    texto: pulado ? 'Você pulou os testes no navegador' : `Testes no navegador (rodada ${p.rodada_qa}): ${ok} de ${resultados.length} passaram`,
    dados: { painel: pulado ? 'parado' : aprovado ? 'ok' : 'falha' },
  });
  const { error: e2 } = await servico.from('squad_projetos').update({ subpasso: 'igor_avalia', passo_em: null, tentativas: 0 }).eq('id', p.id);
  if (e2) throw e2;
  return json({ ok: true });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ erro: 'use POST' }, 405);

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: auth } = await servico.auth.getUser(token);
  if (!auth?.user) return json({ erro: 'Entre na sua conta.' }, 401);
  const { data: membro } = await servico.from('squad_usuarios').select('user_id').eq('user_id', auth.user.id).maybeSingle();
  if (!membro) return json({ erro: 'Sua conta não tem acesso ao SquadTech.' }, 403);

  let corpo: Record<string, unknown>;
  try {
    corpo = await req.json();
  } catch {
    return json({ erro: 'JSON inválido' }, 400);
  }
  try {
    switch (corpo.acao) {
      case 'criar': return await criar(auth.user.id, corpo);
      case 'responder': return await responder(auth.user.id, corpo);
      case 'decidir': return await decidir(auth.user.id, corpo);
      case 'retomar': return await retomar(auth.user.id, corpo);
      case 'testes': return await testes(auth.user.id, corpo);
      default: return json({ erro: 'ação desconhecida' }, 400);
    }
  } catch (e) {
    if (e instanceof Recusa) return json({ erro: e.message }, e.status);
    console.error('squad-pedir:', e);
    return json({ erro: 'Falha ao registrar o pedido. Tente de novo.' }, 500);
  }
});
