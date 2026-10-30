import { supabase } from './supabase.js';

const MSG_LOGIN_INVALIDO = 'Email ou senha inválidos';

function normalizar(email) {
  return String(email ?? '').trim().toLowerCase();
}

// Página atual sem hash nem query, para o link de recuperação voltar ao app.
function urlDoApp() {
  return location.origin + location.pathname;
}

export async function entrar(email, senha) {
  const emailLimpo = normalizar(email);
  if (!emailLimpo || !senha) throw new Error(MSG_LOGIN_INVALIDO);
  try {
    const { error } = await supabase.auth.signInWithPassword({ email: emailLimpo, password: String(senha) });
    if (error) throw error;
  } catch {
    throw new Error(MSG_LOGIN_INVALIDO);
  }
}

export async function sair() {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  } catch {
    // Sem rede ou sessão já inválida: garante ao menos a limpeza local.
    try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* ignora */ }
  }
}

export async function obterSessao() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) return null;
    return data?.session ?? null;
  } catch {
    return null;
  }
}

export async function enviarRecuperacao(email) {
  const emailLimpo = normalizar(email);
  if (!emailLimpo) throw new Error('Informe seu email para recuperar a senha');
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(emailLimpo, { redirectTo: urlDoApp() });
    if (error) throw error;
  } catch (e) {
    if (e?.status === 429) throw new Error('Muitas tentativas. Aguarde alguns minutos e tente novamente');
    throw new Error('Não foi possível enviar o link. Verifique sua conexão');
  }
}

export async function definirNovaSenha(senha) {
  const nova = String(senha ?? '');
  if (nova.length < 6) throw new Error('A senha deve ter pelo menos 6 caracteres');
  try {
    const { error } = await supabase.auth.updateUser({ password: nova });
    if (error) throw error;
  } catch (e) {
    const texto = String(e?.message || '').toLowerCase();
    if (texto.includes('different') || texto.includes('same')) {
      throw new Error('A nova senha deve ser diferente da anterior');
    }
    if (texto.includes('session') || texto.includes('jwt') || e?.status === 401) {
      throw new Error('Link de recuperação inválido ou expirado. Peça um novo');
    }
    throw new Error('Não foi possível alterar a senha. Tente novamente');
  }
}

export function aoMudarAuth(cb) {
  if (typeof cb !== 'function') return;
  supabase.auth.onAuthStateChange((evento, sessao) => {
    // Fora do callback do supabase-js, para permitir chamadas ao Supabase dentro de cb.
    setTimeout(() => cb(evento, sessao ?? null), 0);
  });
}
