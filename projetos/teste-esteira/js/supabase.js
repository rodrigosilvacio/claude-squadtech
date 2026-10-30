// Cliente Supabase do dono, autenticação e cliente público isolado para a página de check-in.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.5/+esm';
import { SUPABASE_URL, SUPABASE_CHAVE } from './config.js';

const MSG_LOGIN = 'E-mail ou senha incorretos.';
const MSG_REDE = 'Não foi possível conectar. Tente de novo.';
const MSG_GENERICA = 'Algo deu errado. Tente de novo.';
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Vários apps compartilham a mesma origem no GitHub Pages: storageKey próprio evita
// misturar a sessão do dono com a de outros projetos.
export const supabase = createClient(SUPABASE_URL, SUPABASE_CHAVE, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'sq_teste_esteira_9f79_auth'
  }
});

function ehErroDeRede(erro) {
  if (!erro) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const nome = String(erro.name || '');
  const msg = String(erro.message || '').toLowerCase();
  return nome === 'AuthRetryableFetchError' || nome === 'TypeError' || msg.includes('fetch') || msg.includes('network');
}

/** Entra com e-mail e senha. Lança Error com mensagem amigável em português. */
export async function entrar(email, senha) {
  const emailNormalizado = String(email || '').trim().toLowerCase();
  const senhaTexto = String(senha || '');
  if (!EMAIL_VALIDO.test(emailNormalizado) || !senhaTexto) {
    throw new Error(MSG_LOGIN);
  }
  let resultado;
  try {
    resultado = await supabase.auth.signInWithPassword({ email: emailNormalizado, password: senhaTexto });
  } catch (e) {
    throw new Error(ehErroDeRede(e) ? MSG_REDE : MSG_GENERICA);
  }
  const { data, error } = resultado;
  if (error) {
    if (ehErroDeRede(error)) throw new Error(MSG_REDE);
    throw new Error(MSG_LOGIN);
  }
  if (!data || !data.session) throw new Error(MSG_LOGIN);
}

/** Encerra a sessão do dono. Mesmo com falha de rede, limpa a sessão local. */
export async function sair() {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) await supabase.auth.signOut({ scope: 'local' });
  } catch (e) {
    try { await supabase.auth.signOut({ scope: 'local' }); } catch (_) { /* ignora */ }
  }
}

/** Usuário logado ou null. Usa a sessão local (rápido); o RLS garante o acesso no banco. */
export async function usuarioAtual() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data || !data.session) return null;
    return data.session.user || null;
  } catch (e) {
    return null;
  }
}

// Armazenamento em memória: o cliente público nunca grava nada no localStorage.
function armazenamentoEmMemoria() {
  const mapa = new Map();
  return {
    getItem: (k) => (mapa.has(k) ? mapa.get(k) : null),
    setItem: (k, v) => { mapa.set(k, v); },
    removeItem: (k) => { mapa.delete(k); }
  };
}

/**
 * Cliente anônimo para a página pública. Sempre age como anon, sem ler a sessão do dono,
 * e envia o header x-pedido, que a política RLS usa para liberar só o status do próprio pedido.
 */
export function criarClientePublico(idPedido) {
  const id = String(idPedido || '');
  return createClient(SUPABASE_URL, SUPABASE_CHAVE, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: 'sq_teste_esteira_9f79_publico',
      storage: armazenamentoEmMemoria()
    },
    global: {
      headers: { 'x-pedido': id }
    }
  });
}
