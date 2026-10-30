// Dialog do formulário de aluno (RF3, RF5). Não importa app.js nem registra submit.

let emEdicao = null;

const el = (id) => document.getElementById(id);

function ligarErro(campo, idErro) {
  if (!campo) return;
  const atuais = (campo.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
  if (!atuais.includes(idErro)) campo.setAttribute('aria-describedby', [...atuais, idErro].join(' '));
}

function definirErro(campo, erroEl, texto) {
  const msg = texto ? String(texto) : '';
  if (erroEl) erroEl.textContent = msg;
  if (!campo) return;
  if (msg) campo.setAttribute('aria-invalid', 'true');
  else campo.removeAttribute('aria-invalid');
}

function prepararAcessibilidade() {
  ligarErro(el('campo-nome'), 'erro-nome');
  ligarErro(el('campo-email'), 'erro-email');
  for (const id of ['erro-nome', 'erro-email']) {
    const e = el(id);
    if (e && !e.hasAttribute('aria-live')) e.setAttribute('aria-live', 'assertive');
  }
}

function focarNome() {
  const nome = el('campo-nome');
  if (nome) setTimeout(() => nome.focus(), 0);
}

function atualizarTitulo() {
  const titulo = el('form-aluno')?.querySelector('h2');
  if (titulo) titulo.textContent = emEdicao ? 'Editar aluno' : 'Novo aluno';
}

export function mostrarErros(erros = {}) {
  definirErro(el('campo-nome'), el('erro-nome'), erros?.nome);
  definirErro(el('campo-email'), el('erro-email'), erros?.email);
  if (erros?.nome) el('campo-nome')?.focus();
  else if (erros?.email) el('campo-email')?.focus();
}

export function limparFormulario() {
  const nome = el('campo-nome');
  const email = el('campo-email');
  if (nome) nome.value = '';
  if (email) email.value = '';
  definirErro(nome, el('erro-nome'), '');
  definirErro(email, el('erro-email'), '');
  focarNome();
}

export function abrirFormulario(aluno) {
  const dialog = el('form-aluno');
  prepararAcessibilidade();
  emEdicao = aluno && aluno.id != null ? aluno : null;
  atualizarTitulo();

  const nome = el('campo-nome');
  const email = el('campo-email');
  if (nome) nome.value = emEdicao ? String(emEdicao.nome ?? '') : '';
  if (email) email.value = emEdicao ? String(emEdicao.email ?? '') : '';
  definirErro(nome, el('erro-nome'), '');
  definirErro(email, el('erro-email'), '');

  if (dialog && !dialog.open) {
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }
  focarNome();
}

export function fecharFormulario() {
  const dialog = el('form-aluno');
  emEdicao = null;
  definirErro(el('campo-nome'), el('erro-nome'), '');
  definirErro(el('campo-email'), el('erro-email'), '');
  if (!dialog) return;
  if (typeof dialog.close === 'function') {
    if (dialog.open) dialog.close();
  } else {
    dialog.removeAttribute('open');
  }
}

export function lerFormulario() {
  return {
    nome: String(el('campo-nome')?.value ?? ''),
    email: String(el('campo-email')?.value ?? '')
  };
}

export function alunoEmEdicao() {
  return emEdicao;
}

// Esc ou fechamento nativo do dialog também descarta a edição.
const dialogInicial = el('form-aluno');
if (dialogInicial) dialogInicial.addEventListener('close', () => { emEdicao = null; });
