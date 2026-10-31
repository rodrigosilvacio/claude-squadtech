// Integração: auth, navegação, roteamento por hash e resumo.
import { entrar, sair, obterSessao, enviarRecuperacao, definirNovaSenha, aoMudarAuth } from './supabase.js';
import { listarProjetos, listarTarefas } from './dados.js';
import { hojeBrasilia, resumirProjeto, ordenarResumo, filtrarResumo } from './regras.js';
import { renderResumo } from './tela-resumo.js';
import { baixarCsv } from './exportar.js';
import { renderProjeto } from './tela-projeto.js';
import { renderResponsaveis } from './tela-responsaveis.js';

const TELAS = ['tela-login', 'tela-resumo', 'tela-projeto', 'tela-responsaveis'];
const MSG_SESSAO = 'Sessão expirada. Entre de novo.';

let sessao = null;
let emRecuperacao = false;
let filtro = 'ativos';
let linhas = [];
let iniciado = false;
let navMontada = false;
let reqResumo = 0;

function el(tag, props = {}, ...filhos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'className') e.className = v;
    else if (k === 'text') e.textContent = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const f of filhos) if (f) e.append(f);
  return e;
}

function campo(rotulo, controle) {
  return el('div', { className: 'campo' }, el('label', { for: controle.id, text: rotulo }), controle);
}

function hashDeToken() {
  const h = location.hash || '';
  return /access_token=|type=recovery|error_description=/.test(h);
}

function mostrar(idTela) {
  for (const id of TELAS) {
    const t = document.getElementById(id);
    if (t) t.hidden = id !== idTela;
  }
  const nav = document.getElementById('nav');
  if (nav) nav.hidden = idTela === 'tela-login';
}

export function navegar(rota) {
  if (location.hash === rota) rotear();
  else location.hash = rota;
}

/* Navegação */

function montarNav() {
  const nav = document.getElementById('nav');
  if (!nav || navMontada) return;
  navMontada = true;
  nav.setAttribute('aria-label', 'Navegação principal');
  nav.classList.add('nao-imprimir');
  const aResumo = el('a', { id: 'nav-resumo', href: '#resumo', text: 'Resumo' });
  const aResp = el('a', { id: 'nav-responsaveis', href: '#responsaveis', text: 'Responsáveis' });
  const btnSair = el('button', { type: 'button', id: 'btn-sair', text: 'Sair' });
  btnSair.addEventListener('click', async () => {
    btnSair.disabled = true;
    try { await sair(); } catch { /* sessão local já descartada */ }
    sessao = null;
    btnSair.disabled = false;
    navegar('#login');
  });
  nav.replaceChildren(el('strong', { text: 'Gestor do MatosOS' }), aResumo, aResp, btnSair);
}

function marcarNav(rota) {
  const r = document.getElementById('nav-resumo');
  const p = document.getElementById('nav-responsaveis');
  if (r) rota === 'resumo' ? r.setAttribute('aria-current', 'page') : r.removeAttribute('aria-current');
  if (p) rota === 'responsaveis' ? p.setAttribute('aria-current', 'page') : p.removeAttribute('aria-current');
}

/* Login */

function montarLogin() {
  const tela = document.getElementById('tela-login');
  if (!tela) return;
  const email = el('input', { type: 'email', id: 'login-email', autocomplete: 'username', required: true });
  const senha = el('input', { type: 'password', id: 'login-senha', autocomplete: 'current-password', required: true });
  const btnEntrar = el('button', { type: 'submit', id: 'btn-entrar', className: 'btn', text: 'Entrar' });
  const btnEsqueci = el('button', { type: 'button', id: 'btn-esqueci', className: 'btn-link', text: 'Esqueci minha senha' });
  const msg = el('p', { id: 'login-msg', role: 'alert' });
  const h1 = el('h1', { tabindex: '-1', text: 'Gestor do MatosOS' });

  const form = el('form', { id: 'form-login', novalidate: true },
    el('h2', { text: 'Entrar' }),
    campo('E-mail', email),
    campo('Senha', senha),
    el('div', { className: 'acoes' }, btnEntrar, btnEsqueci),
    msg
  );

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    msg.textContent = '';
    btnEntrar.disabled = true;
    try {
      await entrar(email.value, senha.value);
      sessao = await obterSessao();
      senha.value = '';
      // O evento SIGNED_IN pode já ter navegado; evita rotear duas vezes.
      if (location.hash === '#login' || !location.hash) navegar('#resumo');
    } catch (e) {
      msg.textContent = e.message || 'E-mail ou senha inválidos.';
      senha.focus();
    } finally {
      btnEntrar.disabled = false;
    }
  });

  btnEsqueci.addEventListener('click', async () => {
    msg.textContent = '';
    if (!email.value.trim()) {
      msg.textContent = 'Informe o e-mail.';
      email.focus();
      return;
    }
    btnEsqueci.disabled = true;
    try {
      await enviarRecuperacao(email.value);
      msg.textContent = 'Se o e-mail existir, enviamos o link.';
    } catch (e) {
      msg.textContent = e.message;
    } finally {
      btnEsqueci.disabled = false;
    }
  });

  tela.replaceChildren(h1, form);
  email.focus();
}

function montarNovaSenha() {
  const tela = document.getElementById('tela-login');
  if (!tela) return;
  const nova = el('input', { type: 'password', id: 'nova-senha', autocomplete: 'new-password', minlength: '6', required: true });
  const btn = el('button', { type: 'submit', id: 'btn-salvar-senha', className: 'btn', text: 'Salvar nova senha' });
  const msg = el('p', { id: 'nova-senha-msg', role: 'alert' });
  const form = el('form', { id: 'form-nova-senha', novalidate: true },
    el('h2', { text: 'Definir nova senha' }),
    campo('Nova senha (mínimo 6 caracteres)', nova),
    el('div', { className: 'acoes' }, btn),
    msg
  );
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    msg.textContent = '';
    if (nova.value.length < 6) {
      msg.textContent = 'A senha precisa ter ao menos 6 caracteres.';
      nova.focus();
      return;
    }
    btn.disabled = true;
    try {
      await definirNovaSenha(nova.value);
      msg.textContent = 'Senha alterada.';
      emRecuperacao = false;
      sessao = await obterSessao();
      setTimeout(() => navegar(sessao ? '#resumo' : '#login'), 1200);
    } catch (e) {
      msg.textContent = e.message;
      btn.disabled = false;
    }
  });
  tela.replaceChildren(el('h1', { tabindex: '-1', text: 'Gestor do MatosOS' }), form);
  mostrar('tela-login');
  nova.focus();
}

/* Resumo */

function desenharResumo() {
  const visiveis = filtrarResumo(ordenarResumo(linhas), filtro);
  renderResumo(
    visiveis,
    filtro,
    (id) => navegar('#projeto/' + id),
    (f) => { filtro = f; desenharResumo(); },
    () => navegar('#projeto/novo'),
    () => baixarCsv(visiveis)
  );
}

async function carregarResumo() {
  const meu = ++reqResumo;
  const tela = document.getElementById('tela-resumo');
  if (tela && !tela.childElementCount) {
    tela.replaceChildren(el('p', { 'aria-live': 'polite', text: 'Carregando...' }));
  }
  try {
    const [projetos, tarefas] = await Promise.all([listarProjetos(), listarTarefas()]);
    if (meu !== reqResumo) return; // descarta carga antiga
    const hoje = hojeBrasilia();
    const porProjeto = new Map();
    for (const t of tarefas) {
      if (!porProjeto.has(t.projeto_id)) porProjeto.set(t.projeto_id, []);
      porProjeto.get(t.projeto_id).push(t);
    }
    linhas = projetos.map((p) => resumirProjeto(p, porProjeto.get(p.id) || [], hoje));
    // Primeiro desenho em "ativos" alimenta o indicador; depois aplica o filtro atual.
    if (filtro !== 'ativos') {
      const f = filtro;
      filtro = 'ativos';
      desenharResumo();
      filtro = f;
    }
    desenharResumo();
  } catch (e) {
    if (meu !== reqResumo) return;
    if (e.message === MSG_SESSAO) {
      sessao = null;
      navegar('#login');
      return;
    }
    if (tela) {
      const h1 = el('h1', { tabindex: '-1', text: 'Resumo dos projetos' });
      const btn = el('button', { type: 'button', className: 'btn', text: 'Tentar de novo' });
      btn.addEventListener('click', carregarResumo);
      tela.replaceChildren(h1, el('p', { role: 'alert', className: 'erro', text: e.message || 'Não foi possível carregar os dados.' }), btn);
      h1.focus();
    }
  }
}

/* Roteamento */

async function rotear() {
  if (emRecuperacao) { montarNovaSenha(); return; }
  if (hashDeToken()) return; // aguarda o supabase-js processar os tokens

  const hash = (location.hash || '').replace(/^#\/?/, '');
  const [rota, param] = hash.split('/');

  if (!sessao) {
    if (rota !== 'login') { location.hash = '#login'; return; }
    mostrar('tela-login');
    montarLogin();
    return;
  }

  montarNav();
  switch (rota) {
    case 'projeto': {
      marcarNav('');
      mostrar('tela-projeto');
      const id = param === 'novo' || !param ? null : Number(param);
      if (param && param !== 'novo' && !Number.isFinite(id)) { location.hash = '#resumo'; return; }
      await renderProjeto(id, () => navegar('#resumo'));
      break;
    }
    case 'responsaveis':
      marcarNav('responsaveis');
      mostrar('tela-responsaveis');
      await renderResponsaveis();
      break;
    case 'resumo':
      marcarNav('resumo');
      mostrar('tela-resumo');
      await carregarResumo();
      break;
    default:
      location.hash = '#resumo';
  }
}

export async function iniciar() {
  if (iniciado) return;
  iniciado = true;

  // 1. Auth antes de rotear.
  aoMudarAuth((evento, s) => {
    sessao = s;
    if (evento === 'PASSWORD_RECOVERY') {
      emRecuperacao = true;
      history.replaceState(null, '', location.pathname + location.search + '#login');
      montarNovaSenha();
      return;
    }
    if (evento === 'SIGNED_OUT') {
      emRecuperacao = false;
      if (location.hash !== '#login') location.hash = '#login';
      else rotear();
      return;
    }
    if (evento === 'SIGNED_IN' && !emRecuperacao) {
      if (hashDeToken()) {
        history.replaceState(null, '', location.pathname + location.search + '#resumo');
        rotear();
      } else if (!location.hash || location.hash === '#login') {
        navegar('#resumo');
      }
    }
  });

  // 2. Sessão atual.
  sessao = await obterSessao();

  window.addEventListener('hashchange', rotear);

  // 3. Roteia (se há tokens no hash, espera o evento; fallback limpa o hash).
  if (hashDeToken()) {
    setTimeout(() => {
      if (hashDeToken() && !emRecuperacao) {
        history.replaceState(null, '', location.pathname + location.search + (sessao ? '#resumo' : '#login'));
        rotear();
      }
    }, 1500);
    return;
  }
  if (!location.hash) {
    history.replaceState(null, '', location.pathname + location.search + (sessao ? '#resumo' : '#login'));
  }
  await rotear();
}

iniciar();
