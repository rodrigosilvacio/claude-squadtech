// Acesso ao Supabase: login (Supabase Auth) e leitura dos projetos do usuário.
// O cliente vem do script UMD em vendor/ (window.supabase).

import { SUPABASE_CHAVE, SUPABASE_URL } from './config.js';

const cliente = window.supabase?.createClient(SUPABASE_URL, SUPABASE_CHAVE) ?? null;

export const nuvem = {
  disponivel: Boolean(cliente),

  async usuario() {
    if (!cliente) return null;
    const { data } = await cliente.auth.getSession();
    return data.session?.user ?? null;
  },

  aoMudarSessao(cb) {
    // setTimeout: chamar o cliente de dentro do callback do auth pode travar o supabase-js
    cliente?.auth.onAuthStateChange((_evento, sessao) => setTimeout(() => cb(sessao?.user ?? null), 0));
  },

  async entrar(email, senha) {
    if (!cliente) throw new Error('Sem conexão com o Supabase.');
    const { error } = await cliente.auth.signInWithPassword({ email, password: senha });
    if (error) throw new Error(error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : error.message);
  },

  async sair() {
    await cliente?.auth.signOut();
  },

  async ehMembro() {
    const { data, error } = await cliente.rpc('squad_eh_membro');
    if (error) throw error;
    return Boolean(data);
  },

  async listarProjetos() {
    const { data, error } = await cliente
      .from('squad_projetos')
      .select('id, nome, slug, etapa, url_app, criado_em')
      .order('criado_em', { ascending: false })
      .limit(50);
    if (error) throw error;
    return data;
  },
};
