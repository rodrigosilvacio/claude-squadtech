// Validação e normalização puras (RF3, RF4 e busca do RF7). Sem dependências.

export const MSG_NOME_INVALIDO = 'O nome deve ter entre 2 e 120 caracteres';
export const MSG_EMAIL_INVALIDO = 'Informe um email válido';
export const MSG_EMAIL_DUPLICADO = 'Já existe um aluno com este email';

const NOME_MIN = 2;
const NOME_MAX = 120;

// Mesma regra do check do banco (lá a âncora final é \Z).
const REGEX_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function normalizarNome(nome) {
  return String(nome ?? '').trim();
}

export function normalizarEmail(email) {
  return String(email ?? '').replace(/\s+/g, '').toLowerCase();
}

// Conta por code point, como o char_length do Postgres.
function tamanho(texto) {
  return Array.from(texto).length;
}

export function validarAluno(dados, existentes = [], idAtual) {
  const nome = normalizarNome(dados?.nome);
  const email = normalizarEmail(dados?.email);
  const erros = {};

  const tam = tamanho(nome);
  if (tam < NOME_MIN || tam > NOME_MAX) erros.nome = MSG_NOME_INVALIDO;

  if (!REGEX_EMAIL.test(email)) {
    erros.email = MSG_EMAIL_INVALIDO;
  } else {
    const lista = Array.isArray(existentes) ? existentes : [];
    const duplicado = lista.some((a) =>
      a && (idAtual == null || String(a.id) !== String(idAtual)) && normalizarEmail(a.email) === email
    );
    if (duplicado) erros.email = MSG_EMAIL_DUPLICADO;
  }

  return { ok: Object.keys(erros).length === 0, erros, dados: { nome, email } };
}

// Remove acentos e devolve em minúsculas, para busca sem diferenciar caixa nem acento.
export function semAcento(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}
