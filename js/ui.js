// Interface ao redor do escritório: trilha de fases, conversa, artefatos,
// equipe, projetos, portões de aprovação e entrega.

import { marked } from '../vendor/marked-12.0.2.esm.js';
import DOMPurify from '../vendor/purify-3.1.6.es.mjs';
import { AGENTES, POR_ID } from './agentes.js';
import { SALAS } from './mapa.js';
import { desenharRetrato } from './sprites.js';

const $ = (sel) => document.querySelector(sel);

const TRILHA = [
  { id: 'produto', rotulo: 'Produto' },
  { id: 'portao_prd', rotulo: 'Aprovar PRD', portao: true },
  { id: 'arquitetura', rotulo: 'Arquitetura' },
  { id: 'portao_arquitetura', rotulo: 'Aprovar arquitetura', portao: true },
  { id: 'desenvolvimento', rotulo: 'Dev' },
  { id: 'testes', rotulo: 'Testes' },
  { id: 'delivery', rotulo: 'Delivery' },
];

const ROTULO_ARTEFATO = {
  briefing: 'Briefing', perguntas: 'Perguntas', respostas: 'Respostas', prd: 'PRD',
  arquitetura: 'Arquitetura', sql: 'SQL', plano: 'Plano de tarefas', arquivo: 'Arquivo',
  revisao_codigo: 'Revisão de código', testes: 'Testes', relatorio_testes: 'Relatório de testes', entrega: 'Entrega',
};

export function markdownSeguro(md) {
  return DOMPurify.sanitize(marked.parse(String(md ?? '')));
}

function el(tag, attrs = {}, ...filhos) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const f of filhos.flat()) if (f != null) n.append(f);
  return n;
}

function hora(quando) {
  return (quando ? new Date(quando) : new Date()).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// Status legível de cada etapa da esteira (squad_projetos.etapa).
const STATUS_ETAPA = {
  entrevista: 'Sala 1 · Ana e Bruno analisando o briefing',
  aguardando_respostas: 'Aguardando suas respostas',
  prd: 'Sala 1 · Bruno escrevendo o PRD',
  aguardando_aprovacao_prd: 'Aguardando sua aprovação do PRD',
  arquitetura: 'Sala 2 · Carla e Diego desenhando a solução',
  aguardando_aprovacao_arquitetura: 'Aguardando sua aprovação da arquitetura',
  migracao: 'Sala 2 · Diego aplicando a migração no banco',
  planejamento: 'Sala 3 · Eduardo distribuindo as tarefas',
  desenvolvimento: 'Sala 3 · Devs escrevendo o código',
  integracao: 'Sala 3 · Eduardo revisando a integração',
  delivery: 'Sala 5 · Lucas preparando a entrega',
  concluido: 'Entregue',
  escalado: 'Encerrado pela Ana',
};

function retrato(id, tamanho = 28) {
  const c = el('canvas', { class: 'retrato', width: tamanho * 2, height: tamanho * 2, 'aria-hidden': 'true' });
  c.style.width = `${tamanho}px`;
  c.style.height = `${tamanho}px`;
  desenharRetrato(c, POR_ID[id].visual);
  return c;
}

export class UI {
  constructor(motor) {
    this.motor = motor;
    this.artefatos = [];
    this.filtro = 'todas';
    this.pendente = null; // portão aguardando decisão
    this.montarTrilha();
    this.montarAbas();
    this.montarFiltros();
    this.montarEquipe();
    this.montarTooltip();
    this.montarDialogos();
  }

  // ---------- trilha ----------

  montarTrilha() {
    const ol = $('#trilha');
    ol.replaceChildren(...TRILHA.map((p) => el('li', { 'data-passo': p.id, class: p.portao ? 'portao' : '' },
      el('span', { class: 'marcador', 'aria-hidden': 'true' }), el('span', { text: p.rotulo }))));
  }

  marcarPasso(idAtivo, estado = 'ativo') {
    const idx = TRILHA.findIndex((p) => p.id === idAtivo);
    for (const [i, p] of TRILHA.entries()) {
      const li = $(`#trilha [data-passo="${p.id}"]`);
      li.dataset.estado = idx < 0 ? '' : i < idx ? 'feito' : i === idx ? estado : '';
    }
  }

  definirFase(sala) {
    this.marcarPasso(sala);
    const s = SALAS[sala];
    if (s) this.status(`Sala ${s.ordem} · ${s.nome}`);
  }

  status(texto) {
    $('#projetoStatus').textContent = texto;
  }

  // ---------- abas ----------

  montarAbas() {
    for (const botao of document.querySelectorAll('.abas [role="tab"]')) {
      botao.addEventListener('click', () => this.abrirAba(botao.dataset.aba));
    }
  }

  abrirAba(nome) {
    for (const botao of document.querySelectorAll('.abas [role="tab"]')) {
      const ativa = botao.dataset.aba === nome;
      botao.setAttribute('aria-selected', String(ativa));
      $(`#painel-${botao.dataset.aba}`).hidden = !ativa;
    }
  }

  montarFiltros() {
    const caixa = $('#filtros');
    const opcoes = [['todas', 'Todas'], ...Object.entries(SALAS).sort((a, b) => a[1].ordem - b[1].ordem).map(([id, s]) => [id, s.nome])];
    caixa.replaceChildren(...opcoes.map(([id, nome]) => el('button', {
      type: 'button', class: 'chip', 'data-filtro': id, 'aria-pressed': String(id === this.filtro),
      onclick: () => this.filtrar(id),
    }, nome)));
  }

  filtrar(id) {
    this.filtro = id;
    for (const b of document.querySelectorAll('#filtros .chip')) b.setAttribute('aria-pressed', String(b.dataset.filtro === id));
    for (const li of document.querySelectorAll('#conversa > li')) li.hidden = id !== 'todas' && li.dataset.sala !== id;
  }

  montarEquipe() {
    const salas = Object.entries(SALAS).sort((a, b) => a[1].ordem - b[1].ordem);
    $('#equipe').replaceChildren(...salas.map(([id, s]) => el('section', { class: 'equipe-sala' },
      el('h3', {}, el('span', { class: 'ponto', style: `background:${s.destaque}` }), `${s.ordem} · ${s.nome}`),
      el('ul', {}, AGENTES.filter((a) => a.sala === id).map((a) => el('li', {},
        retrato(a.id, 32),
        el('div', {}, el('strong', { text: a.nome }), el('span', { class: 'cargo', text: a.cargo }), el('p', { text: a.papel }))))))));
  }

  // ---------- conversa ----------

  adicionarLinha(li) {
    const lista = $('#conversa');
    if (this.filtro !== 'todas' && li.dataset.sala !== this.filtro) li.hidden = true;
    lista.append(li);
    const painel = $('#painel-conversa');
    painel.scrollTop = painel.scrollHeight;
    $('#vazioConversa').hidden = true;
  }

  registrarFala(ev, quando) {
    const def = POR_ID[ev.agente];
    const para = ev.para === 'usuario' ? 'você' : POR_ID[ev.para]?.nome;
    const sala = SALAS[def.sala];
    const li = el('li', { class: 'fala', 'data-sala': def.sala },
      retrato(def.id),
      el('div', { class: 'fala-corpo' },
        el('div', { class: 'fala-topo' },
          el('strong', { text: def.nome }),
          el('span', { class: 'cargo', text: def.cargo }),
          para ? el('span', { class: 'para', text: `→ ${para}` }) : null,
          el('span', { class: 'tag', style: `--cor:${sala.destaque}`, text: sala.nome }),
          el('time', { text: hora(quando) })),
        el('p', { text: ev.texto })));
    this.adicionarLinha(li);
  }

  registrarSistema(texto, { quando, erro } = {}) {
    this.adicionarLinha(el('li', { class: erro ? 'sistema erro' : 'sistema', 'data-sala': 'sistema' }, el('p', { text: texto }), el('time', { text: hora(quando) })));
  }

  // ---------- artefatos ----------

  registrarArtefato(d, quando) {
    const chave = `${d.tipo}:${d.caminho ?? ''}`;
    const existente = this.artefatos.find((a) => a.chave === chave);
    if (existente) Object.assign(existente, d, { versao: (existente.versao ?? 1) + 1 });
    else this.artefatos.push({ ...d, chave, versao: d.versao ?? 1 });
    this.renderizarArtefatos();
    const autor = POR_ID[d.autor];
    this.registrarSistema(`${autor ? autor.nome : 'O squad'} publicou: ${d.titulo ?? ROTULO_ARTEFATO[d.tipo]}${existente ? ` (v${existente.versao})` : ''}`, { quando });
  }

  renderizarArtefatos() {
    $('#contadorArtefatos').textContent = this.artefatos.length || '';
    $('#vazioArtefatos').hidden = this.artefatos.length > 0;
    $('#artefatos').replaceChildren(...this.artefatos.map((a) => el('li', {},
      el('button', { type: 'button', class: 'artefato', onclick: () => this.verArtefato(a) },
        el('span', { class: `icone icone-${a.tipo}`, 'aria-hidden': 'true' }),
        el('span', { class: 'artefato-texto' },
          el('strong', { text: a.titulo ?? ROTULO_ARTEFATO[a.tipo] }),
          el('span', { text: `${ROTULO_ARTEFATO[a.tipo]} · v${a.versao}${POR_ID[a.autor] ? ` · ${POR_ID[a.autor].nome}` : ''}` }))))));
  }

  corpoDoArtefato(a) {
    if (a.formato === 'codigo') return el('pre', { class: 'codigo' }, el('code', { text: a.conteudo }));
    const div = el('div', { class: 'markdown' });
    div.innerHTML = markdownSeguro(a.conteudo);
    return div;
  }

  verArtefato(a) {
    const dlg = $('#dlgArtefato');
    dlg.querySelector('h2').textContent = a.titulo ?? ROTULO_ARTEFATO[a.tipo];
    dlg.querySelector('.meta').textContent = `${ROTULO_ARTEFATO[a.tipo]} · versão ${a.versao}${POR_ID[a.autor] ? ` · por ${POR_ID[a.autor].nome}` : ''}`;
    dlg.querySelector('.conteudo').replaceChildren(this.corpoDoArtefato(a));
    dlg.showModal();
  }

  // ---------- portões ----------

  montarDialogos() {
    for (const dlg of document.querySelectorAll('dialog')) {
      dlg.querySelector('[data-fechar]')?.addEventListener('click', () => dlg.close());
    }
    // Fechar o portão sem decidir não perde a decisão: fica um botão para reabrir.
    $('#dlgPortao').addEventListener('close', () => { $('#btnPendente').hidden = !this.pendente; });
    $('#btnPendente').addEventListener('click', () => $('#dlgPortao').showModal());
  }

  abrirPortao(ev) {
    const d = ev.dados ?? {};
    const dlg = $('#dlgPortao');
    const corpo = dlg.querySelector('.conteudo');
    const rodape = dlg.querySelector('.rodape');
    dlg.querySelector('h2').textContent = d.titulo ?? 'Sua decisão';
    dlg.querySelector('.meta').textContent = d.subtitulo ?? '';
    const passo = d.tipo === 'perguntas' ? 'produto' : `portao_${d.tipo}`;
    this.marcarPasso(passo, 'aguardando');
    this.status(d.tipo === 'perguntas' ? 'Aguardando suas respostas' : `Aguardando sua aprovação: ${d.tipo === 'prd' ? 'PRD' : 'arquitetura'}`);

    return new Promise((resolve) => {
      const decidir = (decisao) => {
        this.pendente = null;
        $('#btnPendente').hidden = true;
        dlg.close();
        if (d.tipo !== 'perguntas') this.marcarPasso(passo, decisao.aprovado ? 'feito' : 'ativo');
        this.status(decisao.aprovado === false ? 'Ajustes em andamento' : 'Decisão registrada, squad trabalhando');
        // Na esteira real o servidor registra a decisão; aqui só na demonstração.
        if (typeof d.continuar === 'function') {
          if (d.tipo === 'perguntas') this.registrarSistema('Você respondeu as perguntas da Ana');
          else this.registrarSistema(decisao.aprovado ? `Você aprovou: ${d.tipo === 'prd' ? 'PRD' : 'arquitetura'}` : `Você pediu ajustes: "${decisao.comentario}"`);
        }
        resolve(decisao);
      };
      this.pendente = { decidir };

      if (d.tipo === 'perguntas') {
        const campos = d.perguntas.map((p, i) => {
          const area = el('textarea', { rows: 2, id: `resp-${i}`, maxlength: 1500, placeholder: 'Sua resposta' });
          area.value = p.sugestao ?? '';
          const decida = el('input', { type: 'checkbox', id: `decida-${i}` });
          decida.addEventListener('change', () => { area.disabled = decida.checked; });
          return { p, area, decida, bloco: el('div', { class: 'pergunta' },
            el('label', { for: `resp-${i}` }, el('strong', { text: `${i + 1}. ${p.pergunta}` }), p.porque ? el('span', { class: 'porque', text: p.porque }) : null),
            area,
            el('label', { class: 'decida' }, decida, ' Decida você')) };
        });
        corpo.replaceChildren(el('p', { class: 'intro', text: d.intro ?? '' }), ...campos.map((c) => c.bloco));
        rodape.replaceChildren(el('button', {
          type: 'button', class: 'botao primario',
          onclick: () => decidir({ respostas: campos.map((c) => ({ pergunta: c.p.pergunta, resposta: c.decida.checked ? null : c.area.value.trim() || null })) }),
        }, 'Enviar respostas'));
      } else {
        const md = el('div', { class: 'markdown' });
        md.innerHTML = markdownSeguro(d.conteudo);
        const comentario = el('textarea', { rows: 3, maxlength: 2000, placeholder: 'O que precisa mudar? Seja específico.' });
        const caixaAjuste = el('div', { class: 'ajuste', hidden: true }, el('label', { text: 'Ajustes pedidos' }), comentario);
        const btnAjustar = el('button', { type: 'button', class: 'botao' }, 'Pedir ajustes');
        btnAjustar.addEventListener('click', () => {
          if (caixaAjuste.hidden) { caixaAjuste.hidden = false; btnAjustar.textContent = 'Enviar ajustes'; comentario.focus(); return; }
          if (comentario.value.trim().length < 5) { comentario.focus(); return; }
          decidir({ aprovado: false, comentario: comentario.value.trim() });
        });
        corpo.replaceChildren(md, caixaAjuste);
        rodape.replaceChildren(btnAjustar, el('button', { type: 'button', class: 'botao primario', onclick: () => decidir({ aprovado: true }) }, 'Aprovar'));
      }
      dlg.showModal();
    });
  }

  // ---------- entrega ----------

  fim(d) {
    const dlg = $('#dlgEntrega');
    dlg.querySelector('h2').textContent = d.escalado ? 'Projeto encerrado' : 'Solução entregue';
    dlg.querySelector('.meta').textContent = d.escalado ? 'Sala 1 · Produto' : 'Sala 5 · Delivery';
    if (d.escalado) {
      this.status(STATUS_ETAPA.escalado);
    } else {
      this.marcarPasso('delivery', 'feito');
      this.status('Entregue');
    }
    dlg.querySelector('.conteudo').replaceChildren(
      el('p', { text: d.resumo ?? 'Solução entregue.' }),
      el('ul', { class: 'links' }, (d.links ?? []).map((l) => el('li', {},
        l.url ? el('a', { href: l.url, target: '_blank', rel: 'noopener' }, l.rotulo) : el('span', { class: 'desabilitado', text: l.rotulo }),
        l.nota ? el('small', { text: l.nota }) : null))),
      d.zip ? el('button', { type: 'button', class: 'botao', onclick: () => this.aoBaixarZip?.() }, 'Baixar zip da pasta') : null,
      d.arquivos ? el('pre', { class: 'arvore', text: d.arquivos }) : null);
    dlg.showModal();
  }

  // ---------- tooltip ----------

  montarTooltip() {
    const tip = $('#tooltip');
    this.motor.aoPassarMouse = (a, x, y) => {
      if (!a) { tip.hidden = true; return; }
      const estado = a.emote === 'aguardando' ? 'aguardando você'
        : a.atividade === 'digitando' ? 'digitando' : a.atividade === 'lendo' ? 'lendo'
          : a.atividade === 'pensando' ? 'pensando' : a.rota.length ? 'andando' : 'disponível';
      tip.replaceChildren(el('strong', { text: a.def.nome }), el('span', { text: a.def.cargo }), el('small', { text: `${SALAS[a.def.sala].nome} · ${estado}` }));
      tip.style.left = `${x}px`;
      tip.style.top = `${y}px`;
      tip.hidden = false;
    };
  }

  // ---------- projeto ----------

  // Estado do projeto real (squad_projetos): status, faixa de erro e botão de retomar.
  atualizarProjeto(p, { aoRetomar } = {}) {
    if (STATUS_ETAPA[p.etapa]) this.status(STATUS_ETAPA[p.etapa]);
    const faixa = $('#projetoErro');
    faixa.hidden = !p.erro;
    if (p.erro) {
      faixa.replaceChildren(
        el('span', { text: `A esteira parou: ${p.erro}` }),
        el('button', { type: 'button', class: 'botao', onclick: aoRetomar }, 'Retomar'));
    }
    $('#projetoTokens').textContent = p.tokens_entrada != null
      ? `${Math.round((p.tokens_entrada + p.tokens_saida) / 1000)} mil tokens` : '';
    $('#projetoLinks').replaceChildren(...(p.url_app ? [
      el('a', { href: p.url_app, target: '_blank', rel: 'noopener' }, 'Abrir app'),
      el('button', { type: 'button', class: 'link', onclick: () => this.aoBaixarZip?.() }, 'Baixar zip'),
    ] : []));
  }

  iniciarProjeto(nome, modo) {
    $('#briefing').hidden = true;
    $('#projetoBarra').hidden = false;
    $('#projetoNome').textContent = nome;
    $('#projetoModo').textContent = modo;
    this.abrirAba('conversa');
  }

  reiniciar() {
    this.artefatos = [];
    this.pendente = null;
    for (const dlg of document.querySelectorAll('dialog[open]')) dlg.close();
    $('#btnPendente').hidden = true;
    $('#conversa').replaceChildren();
    $('#vazioConversa').hidden = false;
    this.renderizarArtefatos();
    this.marcarPasso(null);
    $('#briefing').hidden = false;
    $('#projetoBarra').hidden = true;
    $('#projetoErro').hidden = true;
    $('#projetoTokens').textContent = '';
    $('#projetoLinks').replaceChildren();
  }

  // ---------- projetos (nuvem) ----------

  renderizarProjetos({ logado, membro, projetos, erro, aoEntrar, aoAbrir }) {
    const caixa = $('#listaProjetos');
    if (!logado) {
      caixa.replaceChildren(el('div', { class: 'vazio' },
        el('p', { text: 'Entre com sua conta para ver os projetos salvos.' }),
        el('button', { type: 'button', class: 'botao primario', onclick: aoEntrar }, 'Entrar')));
      return;
    }
    if (erro) { caixa.replaceChildren(el('p', { class: 'vazio', text: erro })); return; }
    if (!membro) { caixa.replaceChildren(el('p', { class: 'vazio', text: 'Sua conta não tem acesso ao SquadTech.' })); return; }
    if (!projetos.length) {
      caixa.replaceChildren(el('p', { class: 'vazio', text: 'Nenhum projeto ainda. Descreva um briefing e clique em "Iniciar projeto".' }));
      return;
    }
    caixa.replaceChildren(el('ul', { class: 'projetos' }, projetos.map((p) => el('li', {},
      el('button', { type: 'button', class: 'projeto', onclick: () => aoAbrir(p.id) },
        el('strong', { text: p.nome }),
        el('span', { text: `${p.erro ? 'parado com erro' : (STATUS_ETAPA[p.etapa] ?? p.etapa.replaceAll('_', ' '))} · ${new Date(p.criado_em).toLocaleDateString('pt-BR')}` })),
      p.url_app ? el('a', { href: p.url_app, target: '_blank', rel: 'noopener' }, 'Abrir app') : null))));
  }
}
