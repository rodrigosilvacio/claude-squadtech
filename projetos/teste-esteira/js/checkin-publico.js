// Página pública de check-in por QR (RF15): só e-mail, só status, nenhum dado pessoal exibido.
import { criarClientePublico } from './supabase.js';

const TABELA_PEDIDOS = 'sq_teste_esteira_9f79_checkin_pedidos';
const INTERVALO_MS = 1500;
const LIMITE_MS = 20000;
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FINAIS = ['confirmada', 'ja_registrada', 'nao_inscrito', 'encerrado'];

const MENSAGENS = {
  confirmada: 'Presença confirmada',
  ja_registrada: 'Sua presença já estava registrada',
  nao_inscrito: 'Não encontramos sua inscrição nesta sessão. Procure o organizador.',
  encerrado: 'Check-in encerrado para esta sessão',
  tempo_esgotado: 'Recebemos seu pedido, confira com o organizador',
  email_invalido: 'Digite um e-mail válido.',
  erro_rede: 'Não foi possível conectar. Tente de novo.'
};
const SUCESSO = ['confirmada', 'ja_registrada'];

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

function normalizar(e) {
  return String(e == null ? '' : e).trim().toLowerCase().replace(/\s+/g, '');
}

function gerarId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
}

/** Insere o pedido pendente e devolve o id. Lança Error com mensagem amigável. */
export async function enviarPedido(sessaoId, token, email) {
  const e = normalizar(email);
  if (e.length > 254 || !EMAIL_VALIDO.test(e)) throw new Error(MENSAGENS.email_invalido);
  const id = gerarId();
  let res;
  try {
    res = await criarClientePublico(id)
      .from(TABELA_PEDIDOS)
      .insert({ id, sessao_id: String(sessaoId), token: String(token).slice(0, 128), email: e }, { returning: 'minimal' });
  } catch (_) {
    throw new Error(MENSAGENS.erro_rede);
  }
  // Sessão inexistente gera erro de FK: tratamos como encerrado, sem expor detalhes.
  if (res && res.error) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error(MENSAGENS.erro_rede);
    const err = new Error(MENSAGENS.encerrado);
    err.status = 'encerrado';
    throw err;
  }
  return id;
}

/** Consulta só o status do próprio pedido até um status final ou o limite. */
export async function aguardarStatus(idPedido, limiteMs = LIMITE_MS) {
  const cliente = criarClientePublico(idPedido);
  const fim = Date.now() + (Number(limiteMs) || LIMITE_MS);
  while (Date.now() < fim) {
    await esperar(INTERVALO_MS);
    try {
      const { data, error } = await cliente.from(TABELA_PEDIDOS).select('status').eq('id', idPedido).maybeSingle();
      if (!error && data && FINAIS.includes(data.status)) return data.status;
    } catch (_) { /* tenta de novo no próximo ciclo */ }
  }
  return 'tempo_esgotado';
}

/** Liga o formulário da página pública. */
export function iniciarCheckinPublico() {
  const form = document.getElementById('checkin-form');
  const campo = document.getElementById('checkin-email');
  const botao = document.getElementById('checkin-enviar');
  const msg = document.getElementById('checkin-msg');
  if (!form || !campo || !botao || !msg) return;

  function mostrar(chave, tipo) {
    msg.textContent = MENSAGENS[chave] || '';
    msg.classList.remove('sucesso', 'erro');
    if (tipo) msg.classList.add(tipo);
  }

  const params = new URLSearchParams(location.search);
  const sessaoId = (params.get('s') || '').trim();
  const token = (params.get('t') || '').trim();
  if (!sessaoId || !token) {
    mostrar('encerrado', 'erro');
    campo.disabled = true;
    botao.disabled = true;
    return;
  }

  let enviando = false;
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (enviando) return;
    const email = normalizar(campo.value);
    if (email.length > 254 || !EMAIL_VALIDO.test(email)) {
      mostrar('email_invalido', 'erro');
      campo.focus();
      return;
    }
    enviando = true;
    botao.disabled = true;
    msg.classList.remove('sucesso', 'erro');
    msg.textContent = 'Enviando...';
    try {
      const id = await enviarPedido(sessaoId, token, email);
      msg.textContent = 'Aguardando confirmação...';
      const status = await aguardarStatus(id, LIMITE_MS);
      mostrar(status, SUCESSO.includes(status) ? 'sucesso' : 'erro');
      if (SUCESSO.includes(status)) form.reset();
    } catch (e) {
      const chave = e && e.status === 'encerrado' ? 'encerrado'
        : (e && e.message === MENSAGENS.email_invalido ? 'email_invalido' : 'erro_rede');
      mostrar(chave, 'erro');
    } finally {
      enviando = false;
      botao.disabled = false;
    }
  });
}

iniciarCheckinPublico();
