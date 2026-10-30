// Telas de check-in (RF5 a RF8, RF16), projeção do QR (RF14, RF16) e faltantes (RF9).
import * as QRModulo from 'https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm';
import {
  obterSessao, listarInscritos, listarPresencas, marcarPresenca, desfazerPresenca,
  encerrarSessao, reabrirSessao, renovarToken, upsertInscrito
} from './dados.js';
import { processarPendentes, limparPedidosSessao } from './processador-qr.js';
import { emailValido } from './csv.js';

const QRCode = (QRModulo && QRModulo.default) || QRModulo;
const INTERVALO_MS = 2000;
const MSG_GENERICA = 'Algo deu errado. Tente de novo.';

function avisar(texto, tipo) {
  window.dispatchEvent(new CustomEvent('sq:aviso', { detail: { texto, tipo } }));
}
function avisarSessoes() {
  window.dispatchEvent(new CustomEvent('sq:sessoes', { detail: {} }));
}
function msgErro(e) { return (e && e.message) || MSG_GENERICA; }

function criar(tag, opcoes = {}, filhos = []) {
  const n = document.createElement(tag);
  if (opcoes.classe) n.className = opcoes.classe;
  if (opcoes.id) n.id = opcoes.id;
  if (opcoes.texto != null) n.textContent = String(opcoes.texto);
  if (opcoes.attrs) for (const [k, v] of Object.entries(opcoes.attrs)) n.setAttribute(k, v);
  for (const f of filhos) if (f) n.appendChild(f);
  return n;
}
function botao(texto, classe, id) {
  return criar('button', { classe: 'btn ' + (classe || ''), id, texto, attrs: { type: 'button' } });
}
function dois(n) { return String(n).padStart(2, '0'); }
function formatarDataHora(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return dois(d.getDate()) + '/' + dois(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + dois(d.getHours()) + ':' + dois(d.getMinutes());
}
function formatarHora(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : dois(d.getHours()) + ':' + dois(d.getMinutes());
}
function semAcento(t) {
  return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
function urlCheckin(sessao) {
  return new URL('./checkin.html?s=' + encodeURIComponent(sessao.id) + '&t=' + encodeURIComponent(sessao.token), location.href).href;
}
function contarPresentes(inscritos, presencas) {
  const ids = new Set(inscritos.map((p) => p.id));
  return presencas.filter((p) => ids.has(p.participante_id)).length;
}

/* ---------- Tela de check-in ---------- */

export async function telaCheckin(el, sessaoId) {
  el.innerHTML = '';
  const estado = { sessao: null, inscritos: [], presencas: new Map(), busca: '', operacoes: 0, ativo: true };
  let seq = 0;

  const tela = criar('section', { classe: 'tela', id: 'ses-tela', attrs: { 'aria-labelledby': 'ses-titulo' } });
  const voltar = criar('a', { classe: 'btn', id: 'ses-voltar', texto: 'Voltar ao workshop', attrs: { href: '#/workshops' } });
  const titulo = criar('h1', { id: 'ses-titulo', texto: 'Check-in' });
  const situacao = criar('p', { id: 'ses-situacao' });
  const status = criar('p', { id: 'ses-status', texto: 'Carregando...', attrs: { role: 'status', 'aria-live': 'polite' } });

  const acoes = criar('div', { id: 'ses-acoes', attrs: { style: 'display:flex;flex-wrap:wrap;gap:0.5rem' } });
  const btnQr = criar('a', { classe: 'btn btn-primario', id: 'ses-projetar', texto: 'Projetar QR', attrs: { href: '#/sessao/' + encodeURIComponent(sessaoId) + '/qr' } });
  const btnFaltantes = criar('a', { classe: 'btn', id: 'ses-faltantes', texto: 'Ver faltantes', attrs: { href: '#/sessao/' + encodeURIComponent(sessaoId) + '/faltantes' } });
  const btnEncerrar = botao('Encerrar sessão', 'btn-perigo', 'ses-encerrar');
  const btnReabrir = botao('Reabrir sessão', '', 'ses-reabrir');
  const btnToken = botao('Gerar novo QR', '', 'ses-token');
  acoes.append(btnQr, btnFaltantes, btnToken, btnEncerrar, btnReabrir);

  const contador = criar('p', { classe: 'contador', id: 'ses-contador', attrs: { 'aria-live': 'polite' } });
  const campoBusca = criar('div', { classe: 'campo' });
  const lblBusca = criar('label', { texto: 'Buscar por nome, e-mail ou empresa', attrs: { for: 'ses-busca' } });
  const busca = criar('input', { classe: 'busca', id: 'ses-busca', attrs: { type: 'search', autocomplete: 'off' } });
  campoBusca.append(lblBusca, busca);

  // Adicionar inscrito na hora (RF5)
  const det = criar('details', { classe: 'cartao', id: 'ses-adicionar' });
  det.appendChild(criar('summary', { texto: 'Adicionar participante' }));
  const form = criar('form', { id: 'ses-form', attrs: { novalidate: '' } });
  const campo = (id, rotulo, tipo, extra = {}) => {
    const c = criar('div', { classe: 'campo' });
    c.appendChild(criar('label', { texto: rotulo, attrs: { for: id } }));
    const i = criar('input', { id, attrs: { type: tipo, maxlength: tipo === 'email' ? '254' : '200', ...extra } });
    c.appendChild(i);
    form.appendChild(c);
    return i;
  };
  const inNome = campo('ses-nome', 'Nome', 'text', { required: '', autocomplete: 'off' });
  const inEmail = campo('ses-email', 'E-mail', 'email', { required: '', inputmode: 'email', autocomplete: 'off' });
  const inEmpresa = campo('ses-empresa', 'Empresa (opcional)', 'text', { autocomplete: 'off' });
  const msgForm = criar('p', { classe: 'erro', id: 'ses-form-msg', attrs: { role: 'alert' } });
  const btnAdd = criar('button', { classe: 'btn btn-primario btn-grande', id: 'ses-form-enviar', texto: 'Adicionar', attrs: { type: 'submit' } });
  form.append(msgForm, btnAdd);
  det.appendChild(form);

  const lista = criar('ul', { classe: 'lista', id: 'ses-lista', attrs: { 'aria-label': 'Inscritos' } });
  tela.append(criar('div', {}, [voltar]), titulo, situacao, status, acoes, contador, campoBusca, det, lista);
  el.appendChild(tela);

  function renderCabecalho() {
    const s = estado.sessao;
    if (!s) return;
    titulo.textContent = s.nome || 'Sessão';
    voltar.setAttribute('href', '#/workshop/' + encodeURIComponent(s.workshop_id));
    const inicio = formatarDataHora(s.inicio);
    situacao.textContent = (inicio ? 'Início: ' + inicio + '. ' : '') + (s.aberta ? 'Sessão aberta.' : 'Sessão encerrada' + (s.encerrada_em ? ' em ' + formatarDataHora(s.encerrada_em) : '') + '.');
    btnQr.classList.toggle('oculto', !s.aberta);
    btnToken.classList.toggle('oculto', !s.aberta);
    btnEncerrar.classList.toggle('oculto', !s.aberta);
    btnReabrir.classList.toggle('oculto', s.aberta);
    btnFaltantes.classList.toggle('oculto', s.aberta);
  }

  function renderLista() {
    const ids = new Set(estado.inscritos.map((p) => p.id));
    let presentes = 0;
    for (const pid of estado.presencas.keys()) if (ids.has(pid)) presentes++;
    contador.textContent = 'Presentes ' + presentes + ' de ' + estado.inscritos.length;

    const focoId = document.activeElement && lista.contains(document.activeElement) ? document.activeElement.getAttribute('data-pid') : null;
    const termo = semAcento(estado.busca.trim());
    const visiveis = estado.inscritos.filter((p) => !termo || semAcento(p.nome + ' ' + p.email + ' ' + (p.empresa || '')).includes(termo));
    lista.textContent = '';
    if (!estado.inscritos.length) {
      lista.appendChild(criar('li', { classe: 'item', texto: 'Nenhum inscrito neste workshop ainda.' }));
      return;
    }
    if (!visiveis.length) {
      lista.appendChild(criar('li', { classe: 'item', texto: 'Ninguém encontrado para esta busca.' }));
      return;
    }
    for (const p of visiveis) {
      const pres = estado.presencas.get(p.id);
      const li = criar('li', { classe: 'item ' + (pres ? 'presente' : 'ausente') });
      const info = criar('div');
      const nome = criar('a', { texto: p.nome, attrs: { href: '#/participante/' + encodeURIComponent(p.id) } });
      info.appendChild(criar('strong', {}, [nome]));
      info.appendChild(criar('div', { texto: p.email + (p.empresa ? ' · ' + p.empresa : '') }));
      if (pres) {
        const linha = criar('div');
        const hora = pres.registrado_em ? formatarHora(pres.registrado_em) : '';
        linha.appendChild(criar('span', { texto: 'Presente' + (hora ? ' às ' + hora : '') + ' ' }));
        const qr = pres.origem === 'qr';
        linha.appendChild(criar('span', { classe: qr ? 'selo-qr' : 'selo-manual', texto: qr ? 'QR' : 'manual', attrs: { 'aria-label': 'Origem: ' + (qr ? 'QR' : 'manual') } }));
        info.appendChild(linha);
      }
      const b = botao(pres ? 'Desfazer' : 'Marcar presença', pres ? 'btn-grande' : 'btn-primario btn-grande');
      b.setAttribute('data-pid', p.id);
      b.setAttribute('aria-label', (pres ? 'Desfazer presença de ' : 'Marcar presença de ') + p.nome);
      b.addEventListener('click', () => (pres ? desfazer(p) : marcar(p)));
      li.append(info, b);
      lista.appendChild(li);
    }
    if (focoId) {
      const alvo = lista.querySelector('button[data-pid="' + CSS.escape(focoId) + '"]');
      if (alvo) alvo.focus();
    }
  }

  // Marcação otimista: aparece na hora e é confirmada com o horário do servidor.
  async function marcar(p) {
    const anterior = estado.presencas.get(p.id);
    estado.presencas.set(p.id, { participante_id: p.id, registrado_em: new Date().toISOString(), origem: 'manual' });
    estado.operacoes++;
    renderLista();
    try {
      const nova = await marcarPresenca(sessaoId, p.id, 'manual');
      estado.presencas.set(p.id, nova);
    } catch (e) {
      if (anterior) estado.presencas.set(p.id, anterior); else estado.presencas.delete(p.id);
      avisar(msgErro(e), 'erro');
    } finally {
      estado.operacoes--;
      if (estado.ativo) renderLista();
    }
  }

  async function desfazer(p) {
    const anterior = estado.presencas.get(p.id);
    estado.presencas.delete(p.id);
    estado.operacoes++;
    renderLista();
    try {
      await desfazerPresenca(sessaoId, p.id);
    } catch (e) {
      if (anterior) estado.presencas.set(p.id, anterior);
      avisar(msgErro(e), 'erro');
    } finally {
      estado.operacoes--;
      if (estado.ativo) renderLista();
    }
  }

  // Sempre recarrega inscritos (até 40) e descarta respostas que chegaram fora de ordem.
  async function recarregar() {
    if (!estado.ativo) return;
    const minha = ++seq;
    try {
      const sessao = await obterSessao(sessaoId);
      const [inscritos, presencas] = await Promise.all([listarInscritos(sessao.workshop_id), listarPresencas(sessaoId)]);
      if (!estado.ativo || minha !== seq || estado.operacoes > 0) return;
      estado.sessao = sessao;
      estado.inscritos = inscritos;
      estado.presencas = new Map(presencas.map((x) => [x.participante_id, x]));
      status.textContent = '';
      renderCabecalho();
      renderLista();
    } catch (e) {
      if (minha === seq && !estado.sessao) status.textContent = msgErro(e);
    }
  }

  busca.addEventListener('input', () => { estado.busca = busca.value; renderLista(); });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    msgForm.textContent = '';
    const nome = inNome.value.trim();
    const email = inEmail.value.trim().toLowerCase();
    if (!nome) { msgForm.textContent = 'Nome é obrigatório.'; inNome.focus(); return; }
    if (!emailValido(email)) { msgForm.textContent = 'Digite um e-mail válido.'; inEmail.focus(); return; }
    if (!estado.sessao) return;
    btnAdd.disabled = true;
    try {
      const r = await upsertInscrito(estado.sessao.workshop_id, { nome, email, empresa: inEmpresa.value });
      form.reset();
      avisar(r === 'atualizado' ? 'Participante já existia e foi atualizado.' : 'Participante adicionado.', 'sucesso');
      await recarregar();
      busca.value = nome; estado.busca = nome; renderLista();
    } catch (e) {
      msgForm.textContent = msgErro(e);
    } finally {
      btnAdd.disabled = false;
    }
  });

  btnEncerrar.addEventListener('click', async () => {
    if (!confirm('Encerrar a sessão? Quem está sem check-in passa a ser faltante e o QR para de aceitar check-ins.')) return;
    btnEncerrar.disabled = true;
    try {
      try { await processarPendentes(sessaoId); } catch (e) { console.error(e); }
      await encerrarSessao(sessaoId);
      try { await limparPedidosSessao(sessaoId); } catch (e) { console.error(e); }
      avisarSessoes();
      avisar('Sessão encerrada.', 'sucesso');
      await recarregar();
    } catch (e) {
      avisar(msgErro(e), 'erro');
    } finally {
      btnEncerrar.disabled = false;
    }
  });

  btnReabrir.addEventListener('click', async () => {
    btnReabrir.disabled = true;
    try {
      await reabrirSessao(sessaoId);
      avisarSessoes();
      avisar('Sessão reaberta. O QR voltou a aceitar check-ins.', 'sucesso');
      await recarregar();
    } catch (e) {
      avisar(msgErro(e), 'erro');
    } finally {
      btnReabrir.disabled = false;
    }
  });

  btnToken.addEventListener('click', async () => {
    if (!confirm('Gerar um novo QR? O QR atual deixa de funcionar.')) return;
    btnToken.disabled = true;
    try {
      await renovarToken(sessaoId);
      avisarSessoes();
      avisar('Novo QR gerado. Projete de novo.', 'sucesso');
      await recarregar();
    } catch (e) {
      avisar(msgErro(e), 'erro');
    } finally {
      btnToken.disabled = false;
    }
  });

  const aoMudar = (ev) => {
    const ids = ev && ev.detail && ev.detail.sessaoIds;
    if (!Array.isArray(ids) || !ids.length || ids.includes(sessaoId)) recarregar();
  };
  window.addEventListener('sq:presencas', aoMudar);
  await recarregar();
  const timer = setInterval(recarregar, INTERVALO_MS);

  return () => {
    estado.ativo = false;
    clearInterval(timer);
    window.removeEventListener('sq:presencas', aoMudar);
  };
}

/* ---------- Tela do QR ---------- */

export async function telaQr(el, sessaoId) {
  el.innerHTML = '';
  let ativo = true;
  let tokenAtual = null;
  let seq = 0;

  const tela = criar('section', { classe: 'qr-tela', id: 'qr-tela', attrs: { 'aria-labelledby': 'qr-titulo' } });
  const btnVoltar = botao('Voltar', '', 'qr-voltar');
  const titulo = criar('h1', { id: 'qr-titulo', texto: 'Carregando...' });
  const instrucao = criar('h2', { id: 'qr-instrucao', texto: 'Aponte a câmera para confirmar sua presença' });
  const canvas = criar('canvas', { classe: 'qr-codigo', id: 'qr-codigo', attrs: { role: 'img', 'aria-label': 'QR de check-in da sessão' } });
  const url = criar('p', { classe: 'qr-url', id: 'qr-url' });
  const contador = criar('p', { classe: 'contador', id: 'qr-contador', attrs: { 'aria-live': 'polite' } });
  const msg = criar('p', { id: 'qr-msg', attrs: { role: 'status', 'aria-live': 'polite' } });
  const btnCheia = botao('Tela cheia', '', 'qr-tela-cheia');
  btnCheia.setAttribute('style', 'position:static');
  tela.append(btnVoltar, titulo, instrucao, canvas, url, contador, msg, btnCheia);
  el.appendChild(tela);

  async function sairTelaCheia() {
    try { if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen(); } catch (_) { /* ignora */ }
  }
  btnVoltar.addEventListener('click', async () => {
    await sairTelaCheia();
    location.hash = '#/sessao/' + encodeURIComponent(sessaoId);
  });
  btnCheia.addEventListener('click', async () => {
    try { if (tela.requestFullscreen) await tela.requestFullscreen(); } catch (_) { /* navegador sem suporte */ }
  });
  if (!tela.requestFullscreen) btnCheia.classList.add('oculto');
  try { if (tela.requestFullscreen) tela.requestFullscreen().catch(() => {}); } catch (_) { /* exige gesto do usuário */ }

  async function desenhar(sessao) {
    const endereco = urlCheckin(sessao);
    url.textContent = endereco;
    try {
      await QRCode.toCanvas(canvas, endereco, { width: 900, margin: 2, errorCorrectionLevel: 'M' });
    } catch (e) {
      console.error(e);
      msg.textContent = 'Não foi possível gerar o QR. Use o endereço acima.';
    }
  }

  async function atualizar() {
    if (!ativo) return;
    const minha = ++seq;
    try {
      const sessao = await obterSessao(sessaoId);
      const [inscritos, presencas] = await Promise.all([listarInscritos(sessao.workshop_id), listarPresencas(sessaoId)]);
      if (!ativo || minha !== seq) return;
      titulo.textContent = sessao.nome || 'Sessão';
      contador.textContent = 'Presentes ' + contarPresentes(inscritos, presencas) + ' de ' + inscritos.length;
      if (!sessao.aberta) {
        canvas.classList.add('oculto');
        url.classList.add('oculto');
        instrucao.textContent = 'Check-in encerrado para esta sessão';
        tokenAtual = '';
        return;
      }
      canvas.classList.remove('oculto');
      url.classList.remove('oculto');
      instrucao.textContent = 'Aponte a câmera para confirmar sua presença';
      if (sessao.token !== tokenAtual) {
        tokenAtual = sessao.token;
        await desenhar(sessao);
      }
      msg.textContent = '';
    } catch (e) {
      if (tokenAtual === null) msg.textContent = msgErro(e);
    }
  }

  const aoMudar = () => atualizar();
  window.addEventListener('sq:presencas', aoMudar);
  await atualizar();
  const timer = setInterval(atualizar, INTERVALO_MS);

  return () => {
    ativo = false;
    clearInterval(timer);
    window.removeEventListener('sq:presencas', aoMudar);
    sairTelaCheia();
  };
}

/* ---------- Tela de faltantes ---------- */

export async function telaFaltantes(el, sessaoId) {
  el.innerHTML = '';
  const tela = criar('section', { classe: 'tela', id: 'falt-tela', attrs: { 'aria-labelledby': 'falt-titulo' } });
  const voltar = criar('a', { classe: 'btn', id: 'falt-voltar', texto: 'Voltar à sessão', attrs: { href: '#/sessao/' + encodeURIComponent(sessaoId) } });
  const titulo = criar('h1', { id: 'falt-titulo', texto: 'Faltantes' });
  const status = criar('p', { id: 'falt-status', texto: 'Carregando...', attrs: { role: 'status', 'aria-live': 'polite' } });
  tela.append(criar('div', {}, [voltar]), titulo, status);
  el.appendChild(tela);

  let sessao, inscritos, presencas;
  try {
    sessao = await obterSessao(sessaoId);
    [inscritos, presencas] = await Promise.all([listarInscritos(sessao.workshop_id), listarPresencas(sessaoId)]);
  } catch (e) {
    status.textContent = '';
    status.appendChild(criar('span', { classe: 'erro', texto: msgErro(e) }));
    avisar(msgErro(e), 'erro');
    return;
  }
  if (!el.contains(tela)) return;

  titulo.textContent = 'Faltantes: ' + (sessao.nome || 'Sessão');
  if (sessao.aberta) {
    status.textContent = 'A sessão ainda está aberta. Encerre a sessão para definir os faltantes.';
    return;
  }
  const presentes = new Set(presencas.map((p) => p.participante_id));
  const faltantes = inscritos.filter((p) => !presentes.has(p.id));
  status.textContent = faltantes.length
    ? faltantes.length + ' faltante' + (faltantes.length > 1 ? 's' : '') + ' de ' + inscritos.length + ' inscritos.'
    : 'Ninguém faltou nesta sessão.';
  if (!faltantes.length) return;

  const assunto = encodeURIComponent('Sentimos sua falta: ' + (sessao.nome || 'workshop'));
  const emails = faltantes.map((p) => p.email).filter(Boolean);
  const todos = criar('a', {
    classe: 'btn btn-primario btn-grande', id: 'falt-todos', texto: 'Escrever para todos (Cco)',
    attrs: { href: 'mailto:?bcc=' + encodeURIComponent(emails.join(',')) + '&subject=' + assunto }
  });
  tela.appendChild(criar('div', {}, [todos]));

  const ul = criar('ul', { classe: 'lista', id: 'falt-lista', attrs: { 'aria-label': 'Faltantes' } });
  for (const p of faltantes) {
    const li = criar('li', { classe: 'item ausente' });
    const info = criar('div');
    info.appendChild(criar('strong', {}, [criar('a', { texto: p.nome, attrs: { href: '#/participante/' + encodeURIComponent(p.id) } })]));
    if (p.empresa) info.appendChild(criar('div', { texto: p.empresa }));
    const mail = criar('a', {
      classe: 'btn', texto: 'Enviar e-mail',
      attrs: { href: 'mailto:' + encodeURIComponent(p.email) + '?subject=' + assunto, 'aria-label': 'Enviar e-mail para ' + p.nome }
    });
    li.append(info, mail);
    ul.appendChild(li);
  }
  tela.appendChild(ul);
}
