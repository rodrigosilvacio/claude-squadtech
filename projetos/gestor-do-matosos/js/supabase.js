import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.5/+esm';
import { SUPABASE_URL, SUPABASE_CHAVE } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_CHAVE, {
  auth: {
    storageKey: 'sq_gestor_do_mato_07ca_auth',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

function erroDeRede(error) {
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('fetch') || msg.includes('network') || error?.status === 0;
}

export async function entrar(email, senha) {
  const e = String(email || '').trim();
  const s = String(senha || '');
  if (!e || !s) throw new Error('E-mail ou senha inválidos.');
  const { error } = await supabase.auth.signInWithPassword({ email: e, password: s });
  if (error) {
    if (erroDeRede(error)) throw new Error('Não foi possível conectar. Tente de novo.');
    throw new Error('E-mail ou senha inválidos.');
  }
}

export async function sair() {
  const { error } = await supabase.auth.signOut();
  // Mesmo com falha de rede, a sessão local é descartada pelo supabase-js.
  if (error && !erroDeRede(error)) throw new Error('Não foi possível sair. Tente de novo.');
}

export async function obterSessao() {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data?.session ?? null;
}

export async function enviarRecuperacao(email) {
  const e = String(email || '').trim();
  if (!e) throw new Error('Informe o e-mail.');
  // Sem hash: o supabase-js anexa os tokens e app.js trata PASSWORD_RECOVERY.
  const redirectTo = location.origin + location.pathname;
  const { error } = await supabase.auth.resetPasswordForEmail(e, { redirectTo });
  // Não revela se o e-mail existe; só falha em erro de rede.
  if (error && erroDeRede(error)) throw new Error('Não foi possível enviar. Tente de novo.');
}

export async function definirNovaSenha(senha) {
  const s = String(senha || '');
  if (s.length < 6) throw new Error('A senha precisa ter ao menos 6 caracteres.');
  const { error } = await supabase.auth.updateUser({ password: s });
  if (error) {
    if (erroDeRede(error)) throw new Error('Não foi possível salvar. Tente de novo.');
    if (/session|jwt|token/i.test(error.message || '')) throw new Error('Sessão expirada. Entre de novo.');
    throw new Error('Não foi possível alterar a senha. Tente de novo.');
  }
}

export function aoMudarAuth(cb) {
  supabase.auth.onAuthStateChange((evento, sessao) => {
    // Adia para fora do lock interno do supabase-js (permite consultas no callback).
    setTimeout(() => cb(evento, sessao ?? null), 0);
  });
}
