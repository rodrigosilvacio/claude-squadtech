// Tela de histórico do participante (RF11): workshops e sessões com presente (horário e origem) ou ausente.
import { historicoParticipante, obterParticipante } from './dados.js';

const MSG_GENERICA = 'Algo deu errado. Tente de novo.';

function avisar(texto, tipo) {
  window.dispatchEvent(new CustomEvent('sq:aviso', { detail: { texto, tipo } }));
}

function criar(tag, opcoes = {}, filhos = []) {
  const n = document.createElement(tag);
  if (opcoes.classe) n.className = opcoes.classe;
  if (opcoes.id) n.id = opcoes.id;
  if (opcoes.texto != null) n.textContent = String(opcoes.texto);
  if (opcoes.attrs) for (const [k, v] of Object.entries(opcoes.attrs)) n.setAttribute(k, v);
  for (const f of filhos) if (f) n.appendChild(f);
  return n;
}

function dois(n) { return String(n).padStart(2, '0'); }

function formatarDataHora(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return dois(d.getDate()) + '/' + dois(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + dois(d.getHours()) + ':' + dois(d.getMinutes());
}

// Data do workshop vem como 'AAAA-MM-DD'; formata sem converter fuso.
function formatarData(texto) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(texto || ''));
  return m ? m[3] + '/' + m[2] + '/' + m[1] : '';
}

function itemSessao(item) {
  const presente = item.status === 'presente';
  const li = criar('li', { classe: 'item ' + (presente ? 'presente' : 'ausente') });
  const info = criar('div');
  info.appendChild(criar('strong', { texto: item.sessao.nome || 'Sessão' }));
  const inicio = formatarDataHora(item.sessao.inicio);
  if (inicio) info.appendChild(criar('div', { texto: 'Início: ' + inicio }));
  if (item.sessao.aberta) info.appendChild(criar('div', { texto: 'Sessão em andamento' }));
  li.appendChild(info);

  const status = criar('div');
  if (presente) {
    const horario = formatarDataHora(item.registrado_em);
    status.appendChild(criar('span', { texto: 'Presente' + (horario ? ' às ' + horario : '') + ' ' }));
    const qr = item.origem === 'qr';
    status.appendChild(criar('span', {
      classe: qr ? 'selo-qr' : 'selo-manual',
      texto: qr ? 'QR' : 'manual',
      attrs: { 'aria-label': 'Origem: ' + (qr ? 'QR' : 'manual') }
    }));
  } else {
    status.appendChild(criar('span', { texto: 'Ausente' }));
  }
  li.appendChild(status);
  return li;
}

/** Monta a tela de histórico do participante em el. */
export async function telaParticipante(el, id) {
  el.innerHTML = '';
  const tela = criar('section', { classe: 'tela', id: 'part-tela', attrs: { 'aria-labelledby': 'part-titulo' } });
  const voltar = criar('a', { classe: 'btn', id: 'part-voltar', texto: 'Voltar', attrs: { href: '#/workshops' } });
  voltar.addEventListener('click', (ev) => {
    if (history.length > 1) { ev.preventDefault(); history.back(); }
  });
  const titulo = criar('h1', { id: 'part-titulo', texto: 'Histórico do participante' });
  const estado = criar('p', { id: 'part-estado', texto: 'Carregando...', attrs: { role: 'status', 'aria-live': 'polite' } });
  tela.append(criar('div', {}, [voltar]), titulo, estado);
  el.appendChild(tela);

  let participante;
  let historico;
  try {
    [participante, historico] = await Promise.all([obterParticipante(id), historicoParticipante(id)]);
  } catch (e) {
    const texto = (e && e.message) || MSG_GENERICA;
    estado.textContent = '';
    estado.appendChild(criar('span', { classe: 'erro', texto }));
    avisar(texto, 'erro');
    return;
  }
  if (!el.contains(tela)) return; // usuário já navegou para outra tela

  titulo.textContent = participante.nome || 'Participante';
  const dadosCartao = criar('div', { classe: 'cartao', id: 'part-dados' });
  dadosCartao.appendChild(criar('p', { texto: 'E-mail: ' + (participante.email || '') }));
  if (participante.empresa) dadosCartao.appendChild(criar('p', { texto: 'Empresa: ' + participante.empresa }));

  const encerradas = historico.filter((h) => h.sessao.aberta === false);
  const presencas = encerradas.filter((h) => h.status === 'presente').length;
  if (encerradas.length) {
    dadosCartao.appendChild(criar('p', { classe: 'contador', texto: 'Presente em ' + presencas + ' de ' + encerradas.length + ' sessões encerradas' }));
  }
  tela.insertBefore(dadosCartao, estado);

  if (!historico.length) {
    estado.textContent = 'Este participante ainda não tem sessões nos workshops em que está inscrito.';
    return;
  }
  estado.textContent = '';

  // Agrupa por workshop mantendo a ordem vinda de dados.js.
  const grupos = new Map();
  for (const item of historico) {
    const w = item.workshop;
    if (!w) continue;
    if (!grupos.has(w.id)) grupos.set(w.id, { workshop: w, itens: [] });
    grupos.get(w.id).itens.push(item);
  }

  const lista = criar('div', { id: 'part-historico', classe: 'tela' });
  for (const { workshop, itens } of grupos.values()) {
    const cartao = criar('section', { classe: 'cartao' });
    const h2 = criar('h2');
    const link = criar('a', { texto: workshop.nome || 'Workshop', attrs: { href: '#/workshop/' + encodeURIComponent(workshop.id) } });
    h2.appendChild(link);
    cartao.appendChild(h2);
    const data = formatarData(workshop.data);
    if (data) cartao.appendChild(criar('p', { texto: 'Data: ' + data }));
    const ul = criar('ul', { classe: 'lista' });
    for (const item of itens) ul.appendChild(itemSessao(item));
    cartao.appendChild(ul);
    lista.appendChild(cartao);
  }
  tela.appendChild(lista);
}
