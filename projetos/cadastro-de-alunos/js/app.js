// Ponto de entrada: telas, estado em memória, eventos e mensagens (RF1 a RF10).
import { entrar, sair, obterSessao, enviarRecuperacao, definirNovaSenha, aoMudarAuth } from './auth.js';
import { listarAlunos, criarAluno, atualizarAluno, excluirAluno, ErroSessao, ErroDuplicado } from './alunos.js';
import { validarAluno } from './validacao.js';
import { baixarCsv } from './csv.js';
import { filtrarAlunos, ordenarAlunos, renderizarLista } from './ui-lista.js';
import {
  abrirFormulario, fecharFormulario, lerFormulario, mostrarErros, limparFormulario, alunoEmEdicao
} from './ui-form.js';

const MSG = {
  falhaSalvar: 'Não foi possível salvar. Verifique sua conexão',
  falhaGeral: 'Não foi possível concluir. Verifique sua conexão',
  sessao: 'Sua sessão expirou. Entre novamente',
  duplicado: 'Já existe um aluno com este email',
  recuperacao: 'Se o email existir, enviamos um link de recuperação',
  senhaOk: 'Senha alterada com sucesso',
  linkInvalido: 'Link de recuperação inválido ou expirado. Peça um novo'
};

const el = (id) => document.getElementById(id);

let alunos = [];
let modoRecuperacao = /type=recovery/.test(location.hash);
let saindoPeloUsuario = false;
let timerMensagem = null;

// Aviso dentro do dialog: com showModal, #mensagem fica inerte atrás do backdrop.
function avisoDoFormulario() {
  let aviso = el('mensagem-form');
  if (aviso) return aviso;
  const form = el('form-aluno')?.querySelector('form');
  if (!form) return null;
  aviso = document.createElement('p');
  aviso.id = 'mensagem-form';
  aviso.setAttribute('role', 'alert');
  aviso.setAttribute('aria-live', 'assertive');
  aviso.style.color = '#8a1a12';
  aviso.style.fontWeight = '600';
  aviso.hidden = true;
  const botoes = form.querySelector('.botoes');
  if (botoes) form.insertBefore(aviso, botoes);
  else form.appendChild(aviso);
  return aviso;
}

// Helpers internos (sem export).
function mostrarMensagem(texto, tipo = 'erro') {
  const caixa = el('mensagem');
  clearTimeout(timerMensagem);
  if (caixa) {
    caixa.textContent = texto || '';
    if (texto) caixa.dataset.tipo = tipo;
    else delete caixa.dataset.tipo;
  }
  const aviso = avisoDoFormulario();
  if (aviso) {
    const dentro = Boolean(texto) && tipo === 'erro' && el('form-aluno')?.open;
    aviso.textContent = dentro ? texto : '';
    aviso.hidden = !dentro;
  }
  if (texto && tipo === 'sucesso') timerMensagem = setTimeout(() => mostrarMensagem(''), 6000);
}

async function comBotaoCarregando(botao, fn) {
  if (!botao) return fn();
  if (botao.disabled) return undefined;
  const original = botao.textContent;
  botao.disabled = true;
  botao.setAttribute('aria-busy', 'true');
  botao.textContent = 'Carregando...';
  try {
    return await fn();
  } finally {
    botao.disabled = false;
    botao.removeAttribute('aria-busy');
    botao.textContent = original;
  }
}

function erroLogin(texto) {
  const p = el('erro-login');
  if (p) p.textContent = texto || '';
}

function formLogin() {
  return el('btn-entrar')?.closest('form') || null;
}

function termoBusca() {
  return el('campo-busca')?.value ?? '';
}

function listaVisivel() {
  return ordenarAlunos(filtrarAlunos(alunos, termoBusca()));
}

function render() {
  renderizarLista(filtrarAlunos(alunos, termoBusca()), { onEditar: editar, onExcluir: excluir });
}

// Telas
function mostrarLogin(mensagem) {
  fecharFormulario();
  alunos = [];
  const busca = el('campo-busca');
  if (busca) busca.value = '';
  mostrarMensagem('');
  el('tela-alunos').hidden = true;
  el('tela-login').hidden = false;
  el('form-nova-senha').hidden = true;
  const form = formLogin();
  if (form) form.hidden = false;
  const senha = el('login-senha');
  if (senha) senha.value = '';
  if (mensagem !== undefined) erroLogin(mensagem);
  el('login-email')?.focus();
}

function mostrarNovaSenha() {
  fecharFormulario();
  el('tela-alunos').hidden = true;
  el('tela-login').hidden = false;
  const form = formLogin();
  const nova = el('form-nova-senha');
  if (form && form !== nova && !form.contains(nova)) form.hidden = true;
  nova.hidden = false;
  erroLogin('');
  el('nova-senha')?.focus();
}

async function mostrarAlunos() {
  el('tela-login').hidden = true;
  el('form-nova-senha').hidden = true;
  el('tela-alunos').hidden = false;
  erroLogin('');
  await carregar();
}

async function expirarSessao() {
  await sair();
  mostrarLogin(MSG.sessao);
}

// Retorna true se o erro foi de sessão (já tratado).
async function tratarSessao(erro) {
  if (erro instanceof ErroSessao) {
    await expirarSessao();
    return true;
  }
  return false;
}

async function carregar() {
  alunos = [];
  render();
  try {
    alunos = await listarAlunos();
    render();
  } catch (erro) {
    if (!(await tratarSessao(erro))) mostrarMensagem(MSG.falhaGeral);
  }
}

// Ações da lista
function editar(aluno) {
  mostrarMensagem('');
  abrirFormulario(aluno);
}

async function excluir(aluno) {
  if (!window.confirm(`Excluir ${aluno.nome} definitivamente?`)) return;
  mostrarMensagem('');
  const seletor = `.btn-excluir[data-id="${CSS.escape(String(aluno.id))}"]`;
  const botao = el('lista-alunos')?.querySelector(seletor);
  try {
    await comBotaoCarregando(botao, () => excluirAluno(aluno.id));
    alunos = alunos.filter((a) => String(a.id) !== String(aluno.id));
    render();
  } catch (erro) {
    if (!(await tratarSessao(erro))) mostrarMensagem(MSG.falhaGeral);
  }
}

async function salvar(evento) {
  evento.preventDefault();
  mostrarMensagem('');
  const editando = alunoEmEdicao();
  const resultado = validarAluno(lerFormulario(), alunos, editando?.id);
  if (!resultado.ok) {
    mostrarErros(resultado.erros);
    return;
  }
  mostrarErros({});
  try {
    await comBotaoCarregando(el('btn-salvar'), async () => {
      if (editando) {
        const atualizado = await atualizarAluno(editando.id, resultado.dados);
        alunos = alunos.map((a) => (String(a.id) === String(editando.id) ? atualizado : a));
        render();
        fecharFormulario();
      } else {
        const novo = await criarAluno(resultado.dados);
        alunos = [...alunos, novo];
        render();
        limparFormulario();
      }
    });
  } catch (erro) {
    if (erro instanceof ErroDuplicado) {
      mostrarErros({ email: MSG.duplicado });
    } else if (!(await tratarSessao(erro))) {
      mostrarMensagem(MSG.falhaSalvar);
    }
  }
}

// Login e recuperação
async function aoEntrar(evento) {
  evento.preventDefault();
  erroLogin('');
  try {
    await comBotaoCarregando(el('btn-entrar'), () =>
      entrar(el('login-email')?.value, el('login-senha')?.value)
    );
  } catch (erro) {
    erroLogin(erro?.message || 'Email ou senha inválidos');
    return;
  }
  const senha = el('login-senha');
  if (senha) senha.value = '';
  await mostrarAlunos();
}

async function aoEsquecer() {
  erroLogin('');
  try {
    await comBotaoCarregando(el('link-esqueci'), () => enviarRecuperacao(el('login-email')?.value));
    erroLogin(MSG.recuperacao);
  } catch (erro) {
    erroLogin(erro?.message || MSG.falhaGeral);
    if (!el('login-email')?.value) el('login-email')?.focus();
  }
}

async function aoDefinirSenha(evento) {
  evento.preventDefault();
  erroLogin('');
  try {
    await comBotaoCarregando(el('btn-nova-senha'), () => definirNovaSenha(el('nova-senha')?.value));
  } catch (erro) {
    erroLogin(erro?.message || MSG.falhaGeral);
    return;
  }
  modoRecuperacao = false;
  const campo = el('nova-senha');
  if (campo) campo.value = '';
  history.replaceState(null, '', location.pathname);
  await mostrarAlunos();
  mostrarMensagem(MSG.senhaOk, 'sucesso');
}

async function aoSair() {
  saindoPeloUsuario = true;
  await comBotaoCarregando(el('btn-sair'), () => sair());
  mostrarLogin('');
}

function aoExportar() {
  baixarCsv(listaVisivel());
}

function registrarEventos() {
  const login = formLogin();
  if (login) login.addEventListener('submit', aoEntrar);
  else el('btn-entrar')?.addEventListener('click', aoEntrar);

  el('link-esqueci')?.addEventListener('click', aoEsquecer);
  el('form-nova-senha')?.addEventListener('submit', aoDefinirSenha);
  el('btn-sair')?.addEventListener('click', aoSair);
  el('campo-busca')?.addEventListener('input', render);
  el('btn-novo')?.addEventListener('click', () => {
    mostrarMensagem('');
    abrirFormulario();
  });
  el('btn-exportar')?.addEventListener('click', aoExportar);

  const dialog = el('form-aluno');
  const formAluno = dialog?.querySelector('form');
  if (formAluno) formAluno.addEventListener('submit', salvar);
  else el('btn-salvar')?.addEventListener('click', salvar);
  el('btn-cancelar')?.addEventListener('click', () => fecharFormulario());
}

async function iniciar() {
  registrarEventos();

  aoMudarAuth((evento) => {
    if (evento === 'PASSWORD_RECOVERY') {
      modoRecuperacao = true;
      mostrarNovaSenha();
    } else if (evento === 'SIGNED_OUT') {
      // Saída não pedida pelo professor (ex.: refresh do token falhou) é sessão expirada.
      const peloUsuario = saindoPeloUsuario;
      saindoPeloUsuario = false;
      modoRecuperacao = false;
      if (el('tela-login').hidden) mostrarLogin(peloUsuario ? '' : MSG.sessao);
    }
  });

  const sessao = await obterSessao();
  if (modoRecuperacao && sessao) {
    mostrarNovaSenha();
  } else if (sessao) {
    await mostrarAlunos();
  } else if (modoRecuperacao) {
    modoRecuperacao = false;
    history.replaceState(null, '', location.pathname);
    mostrarLogin(MSG.linkInvalido);
  } else {
    mostrarLogin('');
  }
}

iniciar();
