import { supabase } from './supabase.js';

const T_RESP = 'sq_gestor_do_mato_07ca_responsaveis';
const T_PROJ = 'sq_gestor_do_mato_07ca_projetos';
const T_TAR = 'sq_gestor_do_mato_07ca_tarefas';
const SELECT_TAREFA = `*, responsavel:${T_RESP}(nome)`;

const MSG_SALVAR = 'Não foi possível salvar. Tente de novo.';
const MSG_CARREGAR = 'Não foi possível carregar os dados.';
const MSG_SESSAO = 'Sessão expirada. Entre de novo.';

function traduzir(error, padrao) {
  const msg = String(error?.message || '');
  const codigo = String(error?.code || '');
  if (error?.status === 401 || /jwt|token|not authenticated|session/i.test(msg) || codigo === 'PGRST301') {
    return new Error(MSG_SESSAO);
  }
  return new Error(padrao);
}

function checar({ data, error }, padrao) {
  if (error) throw traduzir(error, padrao);
  return data;
}

function numOuNulo(v) {
  return v === null || v === undefined || v === '' ? null : Number(v);
}

function mapProjeto(r) {
  return {
    id: Number(r.id),
    nome: r.nome,
    data_prevista: r.data_prevista,
    observacao: r.observacao ?? null,
    criado_em: r.criado_em,
    atualizado_em: r.atualizado_em
  };
}

function mapTarefa(r) {
  return {
    id: Number(r.id),
    projeto_id: Number(r.projeto_id),
    responsavel_id: numOuNulo(r.responsavel_id),
    responsavel_nome: r.responsavel?.nome ?? null,
    titulo: r.titulo,
    estagio: Number(r.estagio),
    data_prevista: r.data_prevista,
    concluida: Boolean(r.concluida),
    data_conclusao: r.data_conclusao ?? null,
    criado_em: r.criado_em
  };
}

function mapResponsavel(r) {
  return { id: Number(r.id), nome: r.nome };
}

function dataValida(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

// Validações com textos do contrato; retornam payload limpo.
function validarProjeto(p, parcial) {
  const out = {};
  if (!parcial || 'nome' in p) {
    const nome = String(p.nome ?? '').trim();
    if (!nome) throw new Error('Nome obrigatório');
    if (nome.length > 120) throw new Error('Nome com até 120 caracteres');
    out.nome = nome;
  }
  if (!parcial || 'data_prevista' in p) {
    if (!dataValida(p.data_prevista)) throw new Error('Data prevista obrigatória');
    out.data_prevista = p.data_prevista;
  }
  if (!parcial || 'observacao' in p) {
    const obs = String(p.observacao ?? '').trim();
    if (obs.length > 500) throw new Error('Observação com até 500 caracteres');
    out.observacao = obs || null;
  }
  return out;
}

function validarTarefa(t, parcial) {
  const out = {};
  if (!parcial || 'titulo' in t) {
    const titulo = String(t.titulo ?? '').trim();
    if (!titulo) throw new Error('Título obrigatório');
    if (titulo.length > 200) throw new Error('Título com até 200 caracteres');
    out.titulo = titulo;
  }
  if (!parcial || 'estagio' in t) {
    const e = Number(t.estagio);
    if (!Number.isInteger(e) || e < 1 || e > 5) throw new Error('Estágio inválido');
    out.estagio = e;
  }
  if (!parcial || 'data_prevista' in t) {
    if (!dataValida(t.data_prevista)) throw new Error('Data prevista obrigatória');
    out.data_prevista = t.data_prevista;
  }
  if (!parcial || 'responsavel_id' in t) out.responsavel_id = numOuNulo(t.responsavel_id);
  if ('concluida' in t) {
    out.concluida = Boolean(t.concluida);
    if (out.concluida) {
      if (!dataValida(t.data_conclusao)) throw new Error('Data de conclusão obrigatória');
      out.data_conclusao = t.data_conclusao;
    } else {
      out.data_conclusao = null;
    }
  } else if ('data_conclusao' in t && dataValida(t.data_conclusao)) {
    out.data_conclusao = t.data_conclusao;
  }
  return out;
}

function validarNomeResponsavel(nome) {
  const n = String(nome ?? '').trim();
  if (!n) throw new Error('Nome obrigatório');
  if (n.length > 80) throw new Error('Nome com até 80 caracteres');
  return n;
}

/* Projetos */

export async function listarProjetos() {
  const data = checar(
    await supabase.from(T_PROJ).select('*').order('data_prevista').order('id'),
    MSG_CARREGAR
  );
  return (data || []).map(mapProjeto);
}

export async function obterProjeto(id) {
  const data = checar(
    await supabase.from(T_PROJ).select('*').eq('id', Number(id)).maybeSingle(),
    MSG_CARREGAR
  );
  if (!data) throw new Error('Projeto não encontrado.');
  return mapProjeto(data);
}

export async function criarProjeto(p) {
  const payload = validarProjeto(p || {}, false);
  const data = checar(await supabase.from(T_PROJ).insert(payload).select('*').single(), MSG_SALVAR);
  return mapProjeto(data);
}

export async function editarProjeto(id, p) {
  const payload = validarProjeto(p || {}, true);
  payload.atualizado_em = new Date().toISOString();
  const data = checar(
    await supabase.from(T_PROJ).update(payload).eq('id', Number(id)).select('*').single(),
    MSG_SALVAR
  );
  return mapProjeto(data);
}

export async function tocarProjeto(id) {
  if (id === null || id === undefined) return;
  checar(
    await supabase.from(T_PROJ).update({ atualizado_em: new Date().toISOString() }).eq('id', Number(id)),
    MSG_SALVAR
  );
}

/* Tarefas */

export async function listarTarefas(projetoId) {
  let q = supabase.from(T_TAR).select(SELECT_TAREFA);
  if (projetoId !== undefined && projetoId !== null) q = q.eq('projeto_id', Number(projetoId));
  const data = checar(
    await q.order('data_prevista').order('criado_em').order('id'),
    MSG_CARREGAR
  );
  return (data || []).map(mapTarefa);
}

export async function criarTarefa(t) {
  const projetoId = Number(t?.projeto_id);
  if (!projetoId) throw new Error(MSG_SALVAR);
  const payload = { ...validarTarefa(t || {}, false), projeto_id: projetoId };
  const data = checar(
    await supabase.from(T_TAR).insert(payload).select(SELECT_TAREFA).single(),
    MSG_SALVAR
  );
  const tarefa = mapTarefa(data);
  await tocarProjeto(tarefa.projeto_id);
  return tarefa;
}

export async function editarTarefa(id, t) {
  const payload = validarTarefa(t || {}, true);
  const data = checar(
    await supabase.from(T_TAR).update(payload).eq('id', Number(id)).select(SELECT_TAREFA).single(),
    MSG_SALVAR
  );
  const tarefa = mapTarefa(data);
  await tocarProjeto(tarefa.projeto_id ?? t?.projeto_id);
  return tarefa;
}

// data string conclui; null reabre a tarefa.
export async function concluirTarefa(id, data) {
  let payload;
  if (data === null || data === undefined || data === '') {
    payload = { concluida: false, data_conclusao: null };
  } else {
    if (!dataValida(data)) throw new Error('Data de conclusão obrigatória');
    payload = { concluida: true, data_conclusao: data };
  }
  const row = checar(
    await supabase.from(T_TAR).update(payload).eq('id', Number(id)).select(SELECT_TAREFA).single(),
    MSG_SALVAR
  );
  const tarefa = mapTarefa(row);
  await tocarProjeto(tarefa.projeto_id);
  return tarefa;
}

export async function excluirTarefa(id, projetoId) {
  checar(await supabase.from(T_TAR).delete().eq('id', Number(id)), MSG_SALVAR);
  await tocarProjeto(projetoId);
}

/* Responsáveis */

export async function listarResponsaveis() {
  const data = checar(
    await supabase.from(T_RESP).select('id, nome').order('nome'),
    MSG_CARREGAR
  );
  return (data || []).map(mapResponsavel);
}

export async function criarResponsavel(nome) {
  const n = validarNomeResponsavel(nome);
  const data = checar(
    await supabase.from(T_RESP).insert({ nome: n }).select('id, nome').single(),
    MSG_SALVAR
  );
  return mapResponsavel(data);
}

export async function editarResponsavel(id, nome) {
  const n = validarNomeResponsavel(nome);
  const data = checar(
    await supabase.from(T_RESP).update({ nome: n }).eq('id', Number(id)).select('id, nome').single(),
    MSG_SALVAR
  );
  return mapResponsavel(data);
}

export async function contarTarefasDoResponsavel(id) {
  const { count, error } = await supabase
    .from(T_TAR)
    .select('id', { count: 'exact', head: true })
    .eq('responsavel_id', Number(id));
  if (error) throw traduzir(error, MSG_CARREGAR);
  return Number(count || 0);
}

// on delete set null zera as tarefas; tocamos os projetos afetados (RF16).
export async function excluirResponsavel(id) {
  const afetadas = checar(
    await supabase.from(T_TAR).select('projeto_id').eq('responsavel_id', Number(id)),
    MSG_SALVAR
  );
  checar(await supabase.from(T_RESP).delete().eq('id', Number(id)), MSG_SALVAR);
  const projetos = [...new Set((afetadas || []).map((r) => Number(r.projeto_id)))];
  if (projetos.length) {
    checar(
      await supabase.from(T_PROJ).update({ atualizado_em: new Date().toISOString() }).in('id', projetos),
      MSG_SALVAR
    );
  }
}
