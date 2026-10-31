// Tela Resumo (RF10 a RF14, RF16): monta tudo em #tela-resumo.
import { formatarData, formatarDataHora, contarIncompletos } from './regras.js';

const FILTROS = [
  ['ativos', 'Todos ativos'],
  ['atrasado', 'Atrasado'],
  ['no_prazo', 'No prazo'],
  ['concluidos', 'Concluídos']
];

const COLUNAS = ['Projeto', 'Estágio', 'Próxima tarefa', 'Responsável', 'Data prevista', 'Situação', 'Atualizado em'];

// Total de incompletos calculado na visão de ativos (reusado nos demais filtros).
let ultimoIncompletos = 0;

function el(tag, props = {}, ...filhos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'className') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'hidden') e.hidden = true;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const f of filhos) if (f) e.append(f);
  return e;
}

function celula(rotulo, ...conteudo) {
  const td = el('td', { 'data-rotulo': rotulo });
  for (const c of conteudo) {
    if (c === null || c === undefined || c === '') continue;
    td.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return td;
}

function textoIndicador(n) {
  return `Incompletos: ${n}`;
}

function montarLinha(l, aoAbrir) {
  const tr = el('tr', { id: `resumo-projeto-${l.id}`, className: l.desatualizado ? 'desatualizado' : null });

  const btn = el('button', { type: 'button', className: 'link-projeto', text: l.projeto });
  btn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    aoAbrir(l.id);
  });
  const tdProjeto = celula('Projeto', btn);
  if (l.incompleto) tdProjeto.append(el('span', { className: 'selo-incompleto', text: 'Incompleto' }));

  const selo = el('span', { className: `selo situacao-${l.situacao}`, text: l.situacao_texto });

  const tdAtualizado = celula('Atualizado em', l.atualizado_em ? `Atualizado em ${formatarDataHora(l.atualizado_em)}` : 'Sem registro');
  if (l.desatualizado) {
    tdAtualizado.append(el('span', {
      className: 'aviso-desatualizado',
      text: `Sem atualização há ${l.dias_sem_atualizacao} dias`
    }));
  }

  tr.append(
    tdProjeto,
    celula('Estágio', l.estagio),
    celula('Próxima tarefa', l.proxima_tarefa ?? '-'),
    celula('Responsável', l.responsavel || '-'),
    celula('Data prevista', l.data_proxima ? formatarData(l.data_proxima) : '-'),
    celula('Situação', selo),
    tdAtualizado
  );

  // Linha inteira clicável com mouse; o teclado usa o botão do nome.
  tr.addEventListener('click', () => aoAbrir(l.id));
  return tr;
}

export function renderResumo(linhas, filtro, aoAbrir, aoFiltrar, aoNovo, aoExportar) {
  const tela = document.getElementById('tela-resumo');
  if (!tela) return;
  const lista = Array.isArray(linhas) ? linhas : [];
  const filtroAtual = FILTROS.some(([v]) => v === filtro) ? filtro : 'ativos';
  const focoNoFiltro = document.activeElement?.id === 'resumo-filtro';

  // RF12: o indicador sempre reflete todos os ativos; só a visão padrão recalcula.
  if (filtroAtual === 'ativos') ultimoIncompletos = contarIncompletos(lista);

  const h1 = el('h1', { tabindex: '-1', text: 'Resumo dos projetos' });
  const geradoEm = el('p', { id: 'resumo-gerado-em', className: 'so-impressao' });
  const indicador = el('p', { id: 'resumo-indicador', 'aria-live': 'polite', text: textoIndicador(ultimoIncompletos) });

  const select = el('select', { id: 'resumo-filtro' });
  for (const [valor, texto] of FILTROS) {
    const opt = el('option', { value: valor, text: texto });
    if (valor === filtroAtual) opt.selected = true;
    select.append(opt);
  }
  select.addEventListener('change', () => aoFiltrar(select.value));

  const btnNovo = el('button', { type: 'button', id: 'btn-novo-projeto', className: 'btn', text: 'Novo projeto' });
  btnNovo.addEventListener('click', () => aoNovo());
  const btnImprimir = el('button', { type: 'button', id: 'btn-imprimir', className: 'btn btn-secundario', text: 'Imprimir' });
  btnImprimir.addEventListener('click', () => imprimirResumo());
  const btnCsv = el('button', { type: 'button', id: 'btn-exportar-csv', className: 'btn btn-secundario', text: 'Exportar CSV' });
  btnCsv.addEventListener('click', () => aoExportar());

  const barra = el('div', { className: 'barra-resumo nao-imprimir' },
    el('label', { for: 'resumo-filtro', text: 'Situação' }),
    select, btnNovo, btnImprimir, btnCsv
  );

  const thead = el('thead');
  const trCab = el('tr');
  for (const c of COLUNAS) trCab.append(el('th', { scope: 'col', text: c }));
  thead.append(trCab);
  const tbody = el('tbody');
  for (const l of lista) tbody.append(montarLinha(l, aoAbrir));

  const tabela = el('table', { id: 'resumo-lista', className: 'tabela-resumo', hidden: lista.length === 0 },
    el('caption', { className: 'visualmente-oculto', text: 'Projetos na visão atual' }),
    thead, tbody
  );
  const vazio = el('p', { id: 'resumo-vazio', text: 'Nenhum projeto nesta visão.', hidden: lista.length > 0 });

  tela.replaceChildren(h1, geradoEm, indicador, barra, tabela, vazio);

  if (focoNoFiltro) select.focus();
  else h1.focus();
}

export function imprimirResumo() {
  const alvo = document.getElementById('resumo-gerado-em');
  if (alvo) alvo.textContent = `Gerado em ${formatarDataHora(new Date().toISOString())}`;
  window.print();
}
