// Acesso a dados: workshops, sessões, participantes, inscrições, presenças, taxa, histórico e exportação.
// A RLS restringe tudo ao dono; aqui nunca enviamos user_id (o banco usa default auth.uid()).
import { supabase } from './supabase.js';
import { emailValido } from './csv.js';

export const T = {
  workshops: 'sq_teste_esteira_9f79_workshops',
  sessoes: 'sq_teste_esteira_9f79_sessoes',
  participantes: 'sq_teste_esteira_9f79_participantes',
  inscricoes: 'sq_teste_esteira_9f79_inscricoes',
  presencas: 'sq_teste_esteira_9f79_presencas',
  pedidos: 'sq_teste_esteira_9f79_checkin_pedidos'
};

const MSG_GENERICA = 'Algo deu errado. Tente de novo.';
const MSG_REDE = 'Não foi possível conectar. Tente de novo.';

const COLS_WORKSHOP = 'id, nome, data, criado_em';
const COLS_SESSAO = 'id, workshop_id, nome, inicio, token, aberta, encerrada_em';
const COLS_PARTICIPANTE = 'id, nome, email, empresa';
const COLS_PRESENCA = 'id, sessao_id, participante_id, registrado_em, origem';

// Converte erro do Supabase em mensagem amigável, sem expor detalhes técnicos.
function falha(error) {
  if (error) console.error(error);
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const msg = String((error && error.message) || '').toLowerCase();
  if (offline || msg.includes('fetch') || msg.includes('network')) return new Error(MSG_REDE);
  return new Error(MSG_GENERICA);
}

async function executar(consulta) {
  let res;
  try {
    res = await consulta;
  } catch (e) {
    throw falha(e);
  }
  if (res.error) throw falha(res.error);
  return res.data;
}

function textoObrigatorio(valor, rotulo) {
  const v = String(valor == null ? '' : valor).trim().replace(/\s+/g, ' ');
  if (!v) throw new Error(rotulo + ' é obrigatório.');
  if (v.length > 200) throw new Error(rotulo + ' pode ter no máximo 200 caracteres.');
  return v;
}

function exigirId(id) {
  const v = String(id == null ? '' : id).trim();
  if (!v) throw new Error(MSG_GENERICA);
  return v;
}

export function normalizarEmail(e) {
  return String(e == null ? '' : e).trim().toLowerCase();
}

/* ---------- Workshops ---------- */

export async function listarWorkshops() {
  const dados = await executar(
    supabase.from(T.workshops).select(COLS_WORKSHOP).order('data', { ascending: false }).order('nome')
  );
  return dados || [];
}

export async function salvarWorkshop(w) {
  const nome = textoObrigatorio(w && w.nome, 'Nome');
  const data = String((w && w.data) || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error('Informe uma data válida.');
  const registro = { nome, data };
  if (w && w.id) {
    return executar(
      supabase.from(T.workshops).update(registro).eq('id', w.id).select(COLS_WORKSHOP).single()
    );
  }
  return executar(supabase.from(T.workshops).insert(registro).select(COLS_WORKSHOP).single());
}

export async function excluirWorkshop(id) {
  await executar(supabase.from(T.workshops).delete().eq('id', exigirId(id)));
}

/* ---------- Sessões ---------- */

function ordenarSessoes(lista) {
  return (lista || []).slice().sort((a, b) => {
    const ia = a.inicio ? Date.parse(a.inicio) : Infinity;
    const ib = b.inicio ? Date.parse(b.inicio) : Infinity;
    if (ia !== ib) return ia - ib;
    return String(a.nome).localeCompare(String(b.nome), 'pt-BR');
  });
}

export async function listarSessoes(workshopId) {
  const dados = await executar(
    supabase.from(T.sessoes).select(COLS_SESSAO).eq('workshop_id', exigirId(workshopId))
  );
  return ordenarSessoes(dados);
}

export async function listarSessoesAbertas() {
  const dados = await executar(supabase.from(T.sessoes).select(COLS_SESSAO).eq('aberta', true));
  return ordenarSessoes(dados);
}

export async function obterSessao(id) {
  const dados = await executar(
    supabase.from(T.sessoes).select(COLS_SESSAO).eq('id', exigirId(id)).maybeSingle()
  );
  if (!dados) throw new Error('Sessão não encontrada.');
  return dados;
}

/** 16 bytes aleatórios (128 bits) em hexadecimal: 32 caracteres. */
export function gerarToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function inicioIso(valor) {
  if (valor == null || valor === '') return null;
  const t = Date.parse(valor);
  if (Number.isNaN(t)) throw new Error('Informe data e hora de início válidas.');
  return new Date(t).toISOString();
}

export async function salvarSessao(s) {
  const nome = textoObrigatorio(s && s.nome, 'Nome da sessão');
  const registro = { nome, inicio: inicioIso(s && s.inicio) };
  if (s && s.id) {
    if (s.token) registro.token = s.token;
    return executar(
      supabase.from(T.sessoes).update(registro).eq('id', s.id).select(COLS_SESSAO).single()
    );
  }
  registro.workshop_id = exigirId(s && s.workshop_id);
  registro.token = (s && s.token) || gerarToken();
  registro.aberta = s && typeof s.aberta === 'boolean' ? s.aberta : true;
  return executar(supabase.from(T.sessoes).insert(registro).select(COLS_SESSAO).single());
}

export async function excluirSessao(id) {
  await executar(supabase.from(T.sessoes).delete().eq('id', exigirId(id)));
}

export async function renovarToken(sessaoId) {
  const token = gerarToken();
  const dados = await executar(
    supabase.from(T.sessoes).update({ token }).eq('id', exigirId(sessaoId)).select('id')
  );
  if (!dados || !dados.length) throw new Error('Sessão não encontrada.');
  return token;
}

export async function encerrarSessao(id) {
  await executar(
    supabase.from(T.sessoes)
      .update({ aberta: false, encerrada_em: new Date().toISOString() })
      .eq('id', exigirId(id))
  );
}

export async function reabrirSessao(id) {
  await executar(
    supabase.from(T.sessoes).update({ aberta: true, encerrada_em: null }).eq('id', exigirId(id))
  );
}

/* ---------- Participantes e inscrições ---------- */

function ordenarPorNome(lista) {
  return lista.sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR', { sensitivity: 'base' }));
}

export async function listarInscritos(workshopId) {
  const dados = await executar(
    supabase.from(T.inscricoes)
      .select('participante:' + T.participantes + '(' + COLS_PARTICIPANTE + ')')
      .eq('workshop_id', exigirId(workshopId))
  );
  const lista = (dados || []).map((i) => i.participante).filter(Boolean);
  return ordenarPorNome(lista);
}

export async function upsertInscrito(workshopId, p) {
  const wid = exigirId(workshopId);
  const nome = textoObrigatorio(p && p.nome, 'Nome');
  const email = normalizarEmail(p && p.email).replace(/\s+/g, '');
  if (!emailValido(email)) throw new Error('Digite um e-mail válido.');
  const empresaTexto = String((p && p.empresa) || '').trim().replace(/\s+/g, ' ');
  if (empresaTexto.length > 200) throw new Error('Empresa pode ter no máximo 200 caracteres.');
  const empresa = empresaTexto || null;

  const existente = await executar(
    supabase.from(T.participantes).select('id').eq('email', email).maybeSingle()
  );

  let participanteId;
  let resultado;
  if (existente) {
    participanteId = existente.id;
    await executar(supabase.from(T.participantes).update({ nome, empresa }).eq('id', participanteId));
    resultado = 'atualizado';
  } else {
    const novo = await executar(
      supabase.from(T.participantes).insert({ nome, email, empresa }).select('id').single()
    );
    participanteId = novo.id;
    resultado = 'inserido';
  }

  await executar(
    supabase.from(T.inscricoes).upsert(
      { workshop_id: wid, participante_id: participanteId },
      { onConflict: 'workshop_id,participante_id', ignoreDuplicates: true }
    )
  );
  return resultado;
}

/** Exclui o participante; inscrições e presenças saem por cascade (RF13). */
export async function excluirParticipante(id) {
  await executar(supabase.from(T.participantes).delete().eq('id', exigirId(id)));
}

async function obterParticipante(id) {
  const dados = await executar(
    supabase.from(T.participantes).select(COLS_PARTICIPANTE).eq('id', exigirId(id)).maybeSingle()
  );
  if (!dados) throw new Error('Participante não encontrado.');
  return dados;
}

/* ---------- Presenças ---------- */

export async function listarPresencas(sessaoId) {
  const dados = await executar(
    supabase.from(T.presencas).select(COLS_PRESENCA).eq('sessao_id', exigirId(sessaoId))
  );
  return dados || [];
}

// Remarcar apaga e insere, para valer o horário do servidor da última marcação.
export async function marcarPresenca(sessaoId, participanteId, origem) {
  const sid = exigirId(sessaoId);
  const pid = exigirId(participanteId);
  const o = origem === 'qr' ? 'qr' : 'manual';
  await executar(
    supabase.from(T.presencas).delete().eq('sessao_id', sid).eq('participante_id', pid)
  );
  return executar(
    supabase.from(T.presencas)
      .insert({ sessao_id: sid, participante_id: pid, origem: o })
      .select(COLS_PRESENCA)
      .single()
  );
}

export async function desfazerPresenca(sessaoId, participanteId) {
  await executar(
    supabase.from(T.presencas)
      .delete()
      .eq('sessao_id', exigirId(sessaoId))
      .eq('participante_id', exigirId(participanteId))
  );
}

async function presencasDasSessoes(ids) {
  if (!ids.length) return [];
  const dados = await executar(supabase.from(T.presencas).select(COLS_PRESENCA).in('sessao_id', ids));
  return dados || [];
}

async function idsInscritos(workshopId) {
  const dados = await executar(
    supabase.from(T.inscricoes).select('participante_id').eq('workshop_id', exigirId(workshopId))
  );
  return new Set((dados || []).map((i) => i.participante_id));
}

/* ---------- Taxa de presença (RF10) ---------- */

// taxa = check-ins ÷ (inscritos × sessões encerradas). Só conta presenças de inscritos atuais.
export async function taxaPresenca(workshopId) {
  const sessoes = (await listarSessoes(workshopId)).filter((s) => s.aberta === false);
  if (!sessoes.length) return { total: 0, porSessao: [] };
  const inscritos = await idsInscritos(workshopId);
  const presencas = await presencasDasSessoes(sessoes.map((s) => s.id));
  const qtd = inscritos.size;

  const contagem = new Map();
  for (const p of presencas) {
    if (!inscritos.has(p.participante_id)) continue;
    contagem.set(p.sessao_id, (contagem.get(p.sessao_id) || 0) + 1);
  }
  let soma = 0;
  const porSessao = sessoes.map((s) => {
    const n = contagem.get(s.id) || 0;
    soma += n;
    return { sessao: s, taxa: qtd ? Math.round((n / qtd) * 100) : 0 };
  });
  const total = qtd ? Math.round((soma / (qtd * sessoes.length)) * 100) : 0;
  return { total, porSessao };
}

/* ---------- Histórico do participante (RF11) ---------- */

export async function historicoParticipante(id) {
  const pid = exigirId(id);
  const inscricoes = await executar(
    supabase.from(T.inscricoes)
      .select('workshop:' + T.workshops + '(' + COLS_WORKSHOP + ')')
      .eq('participante_id', pid)
  );
  const workshops = (inscricoes || []).map((i) => i.workshop).filter(Boolean);
  if (!workshops.length) return [];

  const sessoes = await executar(
    supabase.from(T.sessoes).select(COLS_SESSAO).in('workshop_id', workshops.map((w) => w.id))
  );
  const presencas = await executar(
    supabase.from(T.presencas).select(COLS_PRESENCA).eq('participante_id', pid)
  );
  const porSessao = new Map((presencas || []).map((p) => [p.sessao_id, p]));
  const porWorkshop = new Map(workshops.map((w) => [w.id, w]));

  workshops.sort((a, b) => String(b.data).localeCompare(String(a.data)));
  const ordemWorkshop = new Map(workshops.map((w, i) => [w.id, i]));

  return ordenarSessoes(sessoes)
    .sort((a, b) => ordemWorkshop.get(a.workshop_id) - ordemWorkshop.get(b.workshop_id))
    .map((s) => {
      const p = porSessao.get(s.id);
      return {
        workshop: porWorkshop.get(s.workshop_id),
        sessao: s,
        status: p ? 'presente' : 'ausente',
        registrado_em: p ? p.registrado_em : null,
        origem: p ? p.origem : null
      };
    });
}

/* ---------- Exportação (RF12) ---------- */

function formatarDataHora(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dois = (n) => String(n).padStart(2, '0');
  return dois(d.getDate()) + '/' + dois(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + dois(d.getHours()) + ':' + dois(d.getMinutes());
}

export async function linhasExportacao(workshopId) {
  const sessoes = await listarSessoes(workshopId);
  const inscritos = await listarInscritos(workshopId);
  const presencas = await presencasDasSessoes(sessoes.map((s) => s.id));
  const mapa = new Map(presencas.map((p) => [p.sessao_id + '|' + p.participante_id, p]));

  const linhas = [];
  for (const s of sessoes) {
    for (const part of inscritos) {
      const p = mapa.get(s.id + '|' + part.id);
      linhas.push({
        nome: part.nome || '',
        email: part.email || '',
        empresa: part.empresa || '',
        sessao: s.nome || '',
        data_sessao: formatarDataHora(s.inicio),
        status: p ? 'presente' : 'ausente',
        horario_checkin: p ? formatarDataHora(p.registrado_em) : '',
        origem: p ? (p.origem === 'qr' ? 'QR' : 'manual') : ''
      });
    }
  }
  return linhas;
}

// Usado internamente por telas que precisam do participante isolado.
export { obterParticipante };
