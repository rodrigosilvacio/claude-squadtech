import { supabase } from './supabase.js';

const TABELA = 'sq_cadastro_de_al_d0f3_alunos';
const COLUNAS = 'id,nome,email,criado_em,atualizado_em';

export class ErroSessao extends Error {
  constructor(mensagem = 'Sua sessão expirou. Entre novamente') {
    super(mensagem);
    this.name = 'ErroSessao';
  }
}

export class ErroDuplicado extends Error {
  constructor(mensagem = 'Já existe um aluno com este email') {
    super(mensagem);
    this.name = 'ErroDuplicado';
  }
}

export class ErroRede extends Error {
  constructor(mensagem = 'Não foi possível concluir. Verifique sua conexão') {
    super(mensagem);
    this.name = 'ErroRede';
  }
}

function ehErroSessao(erro) {
  const status = Number(erro?.status ?? erro?.statusCode);
  const codigo = String(erro?.code ?? '');
  const texto = String(erro?.message ?? '').toLowerCase();
  return status === 401 || codigo === 'PGRST301' || codigo === 'PGRST302'
    || texto.includes('jwt') || texto.includes('session');
}

// Converte qualquer falha do Supabase ou do fetch em um dos erros tipados do contrato.
function mapearErro(erro) {
  if (erro instanceof ErroSessao || erro instanceof ErroDuplicado || erro instanceof ErroRede) return erro;
  if (String(erro?.code ?? '') === '23505') return new ErroDuplicado();
  if (ehErroSessao(erro)) return new ErroSessao();
  return new ErroRede();
}

async function garantirSessao() {
  let sessao = null;
  try {
    const { data } = await supabase.auth.getSession();
    sessao = data?.session ?? null;
  } catch {
    throw new ErroRede();
  }
  if (!sessao) throw new ErroSessao();
}

function montarDados(dados) {
  return {
    nome: String(dados?.nome ?? '').trim(),
    email: String(dados?.email ?? '').trim().toLowerCase()
  };
}

async function executar(operacao) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new ErroRede();
  try {
    await garantirSessao();
    const { data, error } = await operacao();
    if (error) throw error;
    return data;
  } catch (erro) {
    throw mapearErro(erro);
  }
}

export async function listarAlunos() {
  const data = await executar(() =>
    supabase.from(TABELA).select(COLUNAS).order('nome', { ascending: true })
  );
  return Array.isArray(data) ? data : [];
}

export async function criarAluno(dados) {
  const registro = montarDados(dados);
  return executar(() =>
    supabase.from(TABELA).insert(registro).select(COLUNAS).single()
  );
}

export async function atualizarAluno(id, dados) {
  const registro = { ...montarDados(dados), atualizado_em: new Date().toISOString() };
  return executar(() =>
    supabase.from(TABELA).update(registro).eq('id', id).select(COLUNAS).single()
  );
}

export async function excluirAluno(id) {
  // Zero linhas apagadas (ex.: já excluído em outra aba) conta como sucesso:
  // o objetivo, o registro não existir mais, já foi atingido.
  await executar(() =>
    supabase.from(TABELA).delete().eq('id', id).select('id')
  );
}
