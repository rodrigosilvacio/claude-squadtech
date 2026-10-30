// Roteador por hash, guarda de login, avisos e processador global de pedidos por QR.
import { supabase, usuarioAtual, sair } from './supabase.js';
import { iniciarProcessamento, limparPedidosAntigos } from './processador-qr.js';
import { telaLogin, telaWorkshops, telaWorkshop, telaInscritos } from './telas-workshops.js';
import { telaCheckin, telaQr, telaFaltantes } from './telas-sessao.js';
import { telaParticipante } from './telas-participante.js';

const MSG_GENERICA = 'Algo deu errado. Tente de novo.';
const ROTAS = [
  [/^#\/login$/, (el) => telaLogin(el)],
  [/^#\/workshops$/, (el) => telaWorkshops(el)],
  [/^#\/workshop\/([^/]+)$/, (el, id) => telaWorkshop(el, id)],
  [/^#\/workshop\/([^/]+)\/inscritos$/, (el, id) => telaInscritos(el, id)],
  [/^#\/sessao\/([^/]+)$/, (el, id) => telaCheckin(el, id)],
  [/^#\/sessao\/([^/]+)\/qr$/, (el, id) => telaQr(el, id)],
  [/^#\/sessao\/([^/]+)\/faltantes$/, (el, id) => telaFaltantes(el, id)],
  [/^#\/participante\/([^/]+)$/, (el, id) => telaParticipante(el, id)]
];

let el = null;
let limpezaTela = null;
let pararProcessador = null;
let limpouAntigos = false;
let versaoRota = 0;
let timerAviso = null;

/** Navega para uma rota por hash (ex.: '#/workshops'). */
export function navegar(rota) {
  const alvo = String(rota || '#/workshops');
  if (location.hash === alvo) rotear();
  else location.hash = alvo;
}

function mostrarAviso(texto, tipo) {
  const caixa = document.getElementById('aviso');
  if (!caixa) return;
  caixa.textContent = '';
  const p = document.createElement('p');
  p.className = tipo === 'erro' ? 'erro' : tipo === 'sucesso' ? 'sucesso' : 'sucesso';
  p.textContent = String(texto || '');
  caixa.appendChild(p);
  clearTimeout(timerAviso);
  timerAviso = setTimeout(() => { caixa.textContent = ''; }, 4000);
}

function iniciarProcessador() {
  pararProcessamento();
  pararProcessador = iniciarProcessamento(() => {
    window.dispatchEvent(new CustomEvent('sq:presencas', { detail: { sessaoIds: [] } }));
  });
}

function pararProcessamento() {
  if (pararProcessador) { try { pararProcessador(); } catch (e) { console.error(e); } }
  pararProcessador = null;
}

function aposLogin() {
  if (!limpouAntigos) {
    limpouAntigos = true;
    limparPedidosAntigos().catch((e) => { console.error(e); limpouAntigos = false; });
  }
  if (!pararProcessador) iniciarProcessador();
}

function aoSair() {
  pararProcessamento();
  limpouAntigos = false;
}

function limparTelaAnterior() {
  if (typeof limpezaTela === 'function') {
    try { limpezaTela(); } catch (e) { console.error(e); }
  }
  limpezaTela = null;
}

async function rotear() {
  const minhaVersao = ++versaoRota;
  limparTelaAnterior();
  el.innerHTML = '';
  let hash = location.hash || '#/workshops';
  const usuario = await usuarioAtual();
  if (minhaVersao !== versaoRota) return;

  const btnSair = document.getElementById('btn-sair');
  if (btnSair) btnSair.classList.toggle('oculto', !usuario);

  if (!usuario) {
    aoSair();
    if (hash !== '#/login') { location.replace('#/login'); return; }
  } else {
    aposLogin();
    if (hash === '#/login' || hash === '#/' || hash === '#') { location.replace('#/workshops'); return; }
  }

  let rota = null;
  let param = null;
  for (const [re, fn] of ROTAS) {
    const m = re.exec(hash);
    if (m) { rota = fn; param = m[1] ? decodeURIComponent(m[1]) : null; break; }
  }
  if (!rota) { location.replace('#/workshops'); return; }

  try {
    const r = await rota(el, param);
    if (typeof r === 'function') {
      if (minhaVersao === versaoRota) limpezaTela = r;
      else { try { r(); } catch (e) { console.error(e); } }
    }
  } catch (e) {
    console.error(e);
    if (minhaVersao === versaoRota) mostrarAviso((e && e.message) || MSG_GENERICA, 'erro');
  }
}

/** Liga eventos, roteador e estado de autenticação. */
export async function iniciarApp() {
  el = document.getElementById('app');
  if (!el) return;

  window.addEventListener('sq:aviso', (ev) => {
    const d = (ev && ev.detail) || {};
    mostrarAviso(d.texto, d.tipo);
  });
  window.addEventListener('sq:sessoes', async () => {
    if (await usuarioAtual()) iniciarProcessador();
  });
  window.addEventListener('hashchange', rotear);

  const btnSair = document.getElementById('btn-sair');
  if (btnSair) {
    btnSair.addEventListener('click', async () => {
      btnSair.disabled = true;
      aoSair();
      await sair();
      btnSair.disabled = false;
      navegar('#/login');
    });
  }

  supabase.auth.onAuthStateChange((evento) => {
    if (evento === 'SIGNED_OUT') {
      aoSair();
      if (location.hash !== '#/login') location.hash = '#/login';
    }
  });

  await rotear();
}

iniciarApp();
