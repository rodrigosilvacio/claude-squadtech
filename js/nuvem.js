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

  // Sessão crua como o supabase-js guarda (para a Sala de Testes rodar o app logado).
  // Renova antes se faltar menos de 15 min, para o app não precisar renovar no meio dos testes.
  async sessaoBruta() {
    if (!cliente) return null;
    const { data } = await cliente.auth.getSession();
    if (!data.session) return null;
    if (data.session.expires_at * 1000 - Date.now() < 15 * 60_000) await cliente.auth.refreshSession();
    const chave = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
    return localStorage.getItem(chave);
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
      .select('id, nome, slug, etapa, subpasso, erro, url_app, criado_em')
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
      .select('id, nome, slug, etapa, subpasso, erro, rodada_po, rodada_qa, prefixo_db, tokens_entrada, tokens_saida, tokens_cache, url_app, url_repo, criado_em')
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

  // Testes do Igor que esperam o navegador.
  async testesPendentes(id) {
    const { data, error } = await cliente.from('squad_projetos').select('rascunho, rodada_qa, prefixo_db').eq('id', id).single();
    if (error) throw error;
    return { testes: data.rascunho?.testes ?? [], rodada: data.rodada_qa, prefixo: data.prefixo_db };
  },

  // Última versão de cada arquivo da entrega (código e docs), para montar o zip.
  async arquivosDaEntrega(projetoId) {
    const { data, error } = await cliente.from('squad_artefatos')
      .select('caminho, versao, conteudo').eq('projeto_id', projetoId)
      .in('tipo', ['arquivo', 'entrega']).not('caminho', 'is', null).order('versao');
    if (error) throw error;
    return new Map(data.map((a) => [a.caminho, a.conteudo]));
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
