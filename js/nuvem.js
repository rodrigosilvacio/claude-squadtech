// Acesso ao Supabase: login (Supabase Auth), pedidos à esteira (squad-pedir) e
// leitura dos projetos e eventos do usuário (RLS). O cliente vem do script UMD
// em vendor/ (window.supabase).

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
      .select('id, nome, slug, etapa, erro, url_app, criado_em')
      .order('criado_em', { ascending: false })
      .limit(50);
    if (error) throw error;
    return data;
  },

  // Ações da esteira: criar, responder, decidir, retomar.
  async pedir(acao, corpo = {}) {
    const { data, error } = await cliente.functions.invoke('squad-pedir', { body: { acao, ...corpo } });
    if (error) {
      let msg = error.message;
      try {
        const detalhe = await error.context?.json();
        if (detalhe?.erro) msg = detalhe.erro;
      } catch { /* resposta sem JSON */ }
      throw new Error(msg);
    }
    return data;
  },

  async projeto(id) {
    const { data, error } = await cliente.from('squad_projetos')
      .select('id, nome, slug, etapa, subpasso, erro, rodada_po, tokens_entrada, tokens_saida, url_app, url_repo, criado_em')
      .eq('id', id).single();
    if (error) throw error;
    return data;
  },

  async eventosDesde(projetoId, desdeId) {
    const todos = [];
    for (;;) {
      const { data, error } = await cliente.from('squad_eventos')
        .select('id, tipo, agente, para, sala, texto, dados, criado_em')
        .eq('projeto_id', projetoId).gt('id', desdeId).order('id').limit(500);
      if (error) throw error;
      todos.push(...data);
      if (data.length < 500) return todos;
      desdeId = data[data.length - 1].id;
    }
  },

  // Avisa quando chega evento novo ou o projeto muda. Devolve a função que cancela.
  assinar(projetoId, aoMudar) {
    const canal = cliente.channel(`squad-${projetoId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'squad_eventos', filter: `projeto_id=eq.${projetoId}` }, () => aoMudar('evento'))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'squad_projetos', filter: `id=eq.${projetoId}` }, (m) => aoMudar('projeto', m.new))
      .subscribe();
    return () => cliente.removeChannel(canal);
  },
};
