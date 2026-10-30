// Processador de pedidos de check-in por QR (RF15, RF16).
// Roda nas telas logadas do dono: reivindica pedidos pendentes, valida token, sessão aberta e inscrição,
// grava a presença com origem 'qr' e devolve só o status final ao pedido.
import { supabase } from './supabase.js';
import { T, normalizarEmail } from './dados.js';

const INTERVALO_MS = 2000;
const TRAVADO_MS = 30000;
const UM_DIA_MS = 24 * 60 * 60 * 1000;
const MSG_GENERICA = 'Algo deu errado. Tente de novo.';
const MSG_REDE = 'Não foi possível conectar. Tente de novo.';
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COLS_PEDIDO = 'id, sessao_id, token, email, status, criado_em';

function falha(error) {
  if (error) console.error(error);
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const msg = String((error && error.message) || '').toLowerCase();
  if (offline || msg.includes('fetch') || msg.includes('network')) return new Error(MSG_REDE);
  return new Error(MSG_GENERICA);
}

async function executar(consulta) {
  let res;
  try {
    res = await consulta;
  } catch (e) {
    throw falha(e);
  }
  if (res.error) throw falha(res.error);
  return res.data;
}

// Pedidos elegíveis: pendentes, ou em 'processando' há mais de 30 s (processador que caiu no meio).
// Sem lista de sessões, busca em todas: a RLS restringe às sessões do dono, inclusive as encerradas,
// para que esses pedidos recebam 'encerrado' em vez de ficarem sem resposta.
async function buscarElegiveis(sessaoIds) {
  if (Array.isArray(sessaoIds) && !sessaoIds.length) return [];
  const limite = new Date(Date.now() - TRAVADO_MS).toISOString();
  const filtrar = (q) => (Array.isArray(sessaoIds) ? q.in('sessao_id', sessaoIds) : q);
  const pendentes = await executar(
    filtrar(supabase.from(T.pedidos).select(COLS_PEDIDO))
      .eq('status', 'pendente')
      .order('criado_em', { ascending: true })
      .limit(200)
  );
  const travados = await executar(
    filtrar(supabase.from(T.pedidos).select(COLS_PEDIDO))
      .eq('status', 'processando')
      .lt('criado_em', limite)
      .limit(200)
  );
  return [...(pendentes || []), ...(travados || [])];
}

// Reivindicação atômica: só quem recebe a linha de volta processa o pedido.
async function reivindicar(pedido) {
  let consulta = supabase.from(T.pedidos).update({ status: 'processando' }).eq('id', pedido.id);
  if (pedido.status === 'pendente') {
    consulta = consulta.eq('status', 'pendente');
  } else {
    const limite = new Date(Date.now() - TRAVADO_MS).toISOString();
    consulta = consulta.eq('status', 'processando').lt('criado_em', limite);
  }
  const dados = await executar(consulta.select('id'));
  return Array.isArray(dados) && dados.length === 1;
}

// Só altera se ainda estiver 'processando': a primeira aba que terminar fixa o resultado.
async function definirStatus(id, status) {
  await executar(supabase.from(T.pedidos).update({ status }).eq('id', id).eq('status', 'processando'));
}

async function carregarSessao(id, cache) {
  if (cache.has(id)) return cache.get(id);
  const dados = await executar(
    supabase.from(T.sessoes).select('id, workshop_id, token, aberta').eq('id', id).maybeSingle()
  );
  cache.set(id, dados || null);
  return dados || null;
}

// Decide e grava o resultado de um pedido já reivindicado. Retorna o status final.
async function decidir(pedido, cacheSessoes) {
  const sessao = await carregarSessao(pedido.sessao_id, cacheSessoes);
  if (!sessao || sessao.aberta !== true || typeof pedido.token !== 'string' || pedido.token !== sessao.token) {
    return 'encerrado';
  }

  const email = normalizarEmail(pedido.email).replace(/\s+/g, '');
  if (!email || email.length > 254 || !EMAIL_VALIDO.test(email)) return 'nao_inscrito';

  const participante = await executar(
    supabase.from(T.participantes).select('id').eq('email', email).maybeSingle()
  );
  if (!participante) return 'nao_inscrito';

  const inscricao = await executar(
    supabase.from(T.inscricoes)
      .select('id')
      .eq('workshop_id', sessao.workshop_id)
      .eq('participante_id', participante.id)
      .maybeSingle()
  );
  if (!inscricao) return 'nao_inscrito';

  const existente = await executar(
    supabase.from(T.presencas)
      .select('id')
      .eq('sessao_id', sessao.id)
      .eq('participante_id', participante.id)
      .maybeSingle()
  );
  if (existente) return 'ja_registrada';

  // ignoreDuplicates mantém o horário original se outra marcação chegou antes.
  const inseridos = await executar(
    supabase.from(T.presencas)
      .upsert(
        { sessao_id: sessao.id, participante_id: participante.id, origem: 'qr' },
        { onConflict: 'sessao_id,participante_id', ignoreDuplicates: true }
      )
      .select('id')
  );
  return Array.isArray(inseridos) && inseridos.length ? 'confirmada' : 'ja_registrada';
}

// sessaoIds null: todas as sessões do dono (via RLS).
async function processarLista(sessaoIds) {
  const ids = Array.isArray(sessaoIds) ? [...new Set(sessaoIds.filter(Boolean).map(String))] : null;
  if (ids && !ids.length) return 0;
  const pedidos = await buscarElegiveis(ids);
  const cacheSessoes = new Map();
  let processados = 0;
  for (const pedido of pedidos) {
    let meu = false;
    try {
      meu = await reivindicar(pedido);
    } catch (e) {
      continue;
    }
    if (!meu) continue;
    try {
      const status = await decidir(pedido, cacheSessoes);
      await definirStatus(pedido.id, status);
      processados++;
    } catch (e) {
      // Erro inesperado: devolve para a fila para nova tentativa.
      try { await definirStatus(pedido.id, 'pendente'); } catch (_) { /* fica travado e é retomado após 30 s */ }
    }
  }
  return processados;
}

/** Processa os pedidos de uma sessão ou, sem argumento, de todas as sessões do dono. */
export async function processarPendentes(sessaoId) {
  return processarLista(sessaoId ? [sessaoId] : null);
}

/** Inicia o processamento periódico de todos os pedidos do dono. Retorna a função de parada. */
export function iniciarProcessamento(aoMudar) {
  let ativo = true;
  let ocupado = false;

  async function ciclo() {
    if (!ativo || ocupado) return;
    ocupado = true;
    try {
      const n = await processarLista(null);
      if (ativo && n >= 1 && typeof aoMudar === 'function') {
        try { aoMudar(); } catch (e) { console.error(e); }
      }
    } catch (e) {
      // Falha de rede: tenta de novo no próximo ciclo.
      console.error(e);
    } finally {
      ocupado = false;
    }
  }

  const timer = setInterval(ciclo, INTERVALO_MS);
  ciclo();
  return () => {
    ativo = false;
    clearInterval(timer);
  };
}

/** Apaga todos os pedidos da sessão (usado ao encerrar, depois de responder os pendentes). */
export async function limparPedidosSessao(sessaoId) {
  const id = String(sessaoId == null ? '' : sessaoId).trim();
  if (!id) throw new Error(MSG_GENERICA);
  await executar(supabase.from(T.pedidos).delete().eq('sessao_id', id));
}

/** Apaga pedidos com mais de 1 dia. A RLS limita às sessões do dono. */
export async function limparPedidosAntigos() {
  const limite = new Date(Date.now() - UM_DIA_MS).toISOString();
  await executar(supabase.from(T.pedidos).delete().lt('criado_em', limite));
}
