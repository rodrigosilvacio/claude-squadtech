// Detalhe do projeto (RF3, RF5, RF15): monta tudo em #tela-projeto.
import {
  obterProjeto, criarProjeto, editarProjeto, listarTarefas, criarTarefa,
  editarTarefa, concluirTarefa, excluirTarefa, listarResponsaveis
} from './dados.js';
import { ESTAGIOS, hojeBrasilia, formatarData, situacaoTarefa } from './regras.js';

const MSG_SESSAO = 'Sessão expirada. Entre de novo.';
let renderAtual = 0;

function el(tag, props = {}, ...filhos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'className') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'value') e.value = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const f of filhos) if (f) e.append(f);
  return e;
}

function campo(rotulo, controle, extraClasse) {
  return el('div', { className: 'campo' + (extraClasse ? ' ' + extraClasse : '') },
    el('label', { for: controle.id, text: rotulo }), controle);
}

function dataValida(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
}

function mostrarErro(alvo, erro, campoInvalido) {
  const msg = erro instanceof Error ? erro.message : String(erro || '');
  alvo.textContent = msg;
  if (campoInvalido) {
    campoInvalido.setAttribute('aria-invalid', 'true');
    campoInvalido.focus();
  }
  if (msg === MSG_SESSAO) setTimeout(() => { location.hash = '#login'; }, 800);
}

function limparInvalidos(form) {
  form.querySelectorAll('[aria-invalid]').forEach((c) => c.removeAttribute('aria-invalid'));
}

function montarFormProjeto(projeto) {
  const nome = el('input', { type: 'text', id: 'projeto-nome', maxlength: '120', required: true, autocomplete: 'off', value: projeto?.nome ?? '' });
  const data = el('input', { type: 'date', id: 'projeto-data-prevista', required: true, value: projeto?.data_prevista ?? '' });
  const obs = el('textarea', { id: 'projeto-observacao', maxlength: '500', rows: '3' });
  obs.value = projeto?.observacao ?? '';
  const erro = el('p', { id: 'erro-projeto', role: 'alert', className: 'erro' });
  const msg = el('p', { id: 'projeto-msg', 'aria-live': 'polite' });
  const btn = el('button', { type: 'submit', id: 'btn-salvar-projeto', className: 'btn', text: projeto ? 'Salvar projeto' : 'Criar projeto' });

  const form = el('form', { id: 'form-projeto', novalidate: true },
    el('h2', { text: 'Dados do projeto' }),
    el('div', { className: 'grade-form' },
      campo('Nome do projeto', nome),
      campo('Data prevista de entrega', data),
      campo('Observação (opcional, até 500 caracteres)', obs, 'largura-total')
    ),
    el('div', { className: 'acoes nao-imprimir' }, btn),
    erro, msg
  );

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    limparInvalidos(form);
    erro.textContent = '';
    msg.textContent = '';
    const valores = { nome: nome.value.trim(), data_prevista: data.value, observacao: obs.value.trim() };
    if (!valores.nome) return mostrarErro(erro, 'Nome obrigatório', nome);
    if (valores.nome.length > 120) return mostrarErro(erro, 'Nome com até 120 caracteres', nome);
    if (!dataValida(valores.data_prevista)) return mostrarErro(erro, 'Data prevista obrigatória', data);
    if (valores.observacao.length > 500) return mostrarErro(erro, 'Observação com até 500 caracteres', obs);
    btn.disabled = true;
    try {
      if (projeto) {
        Object.assign(projeto, await editarProjeto(projeto.id, valores));
        msg.textContent = 'Projeto salvo.';
      } else {
        const novo = await criarProjeto(valores);
        location.hash = '#projeto/' + novo.id;
      }
    } catch (e) {
      mostrarErro(erro, e);
    } finally {
      btn.disabled = false;
    }
  });

  return { form, foco: nome };
}

export async function renderProjeto(id, aoVoltar) {
  const tela = document.getElementById('tela-projeto');
  if (!tela) return;
  const meuRender = ++renderAtual;

  const btnVoltar = el('button', { type: 'button', id: 'btn-voltar', className: 'btn btn-secundario nao-imprimir', text: 'Voltar ao resumo' });
  btnVoltar.addEventListener('click', () => aoVoltar());
  const h1 = el('h1', { tabindex: '-1', text: id ? 'Projeto' : 'Novo projeto' });

  if (id === null || id === undefined) {
    const { form, foco } = montarFormProjeto(null);
    tela.replaceChildren(el('div', { className: 'acoes' }, btnVoltar), h1, form);
    foco.focus();
    return;
  }

  const carregando = el('p', { 'aria-live': 'polite', text: 'Carregando...' });
  tela.replaceChildren(el('div', { className: 'acoes' }, btnVoltar), h1, carregando);

  let projeto, tarefas, responsaveis;
  try {
    [projeto, tarefas, responsaveis] = await Promise.all([
      obterProjeto(Number(id)), listarTarefas(Number(id)), listarResponsaveis()
    ]);
  } catch (e) {
    if (meuRender !== renderAtual) return;
    const erro = el('p', { role: 'alert', className: 'erro' });
    carregando.replaceWith(erro);
    mostrarErro(erro, e);
    h1.focus();
    return;
  }
  if (meuRender !== renderAtual) return;

  h1.textContent = projeto.nome;
  const { form: formProjeto, foco } = montarFormProjeto(projeto);

  // Formulário de tarefa (criação em sequência e edição).
  let editandoId = null;
  const titulo = el('input', { type: 'text', id: 'tarefa-titulo', maxlength: '200', required: true, autocomplete: 'off' });
  const estagio = el('select', { id: 'tarefa-estagio' });
  ESTAGIOS.forEach((nome, i) => estagio.append(el('option', { value: String(i + 1), text: nome })));
  const resp = el('select', { id: 'tarefa-responsavel' }, el('option', { value: '', text: 'Sem responsável' }));
  responsaveis.forEach((r) => resp.append(el('option', { value: String(r.id), text: r.nome })));
  const dataTarefa = el('input', { type: 'date', id: 'tarefa-data-prevista', required: true });
  const erroTarefa = el('p', { id: 'erro-tarefa', role: 'alert', className: 'erro' });
  const msgTarefa = el('p', { 'aria-live': 'polite' });
  const tituloForm = el('h2', { text: 'Nova tarefa' });
  const btnTarefa = el('button', { type: 'submit', id: 'btn-salvar-tarefa', className: 'btn', text: 'Adicionar tarefa' });
  const btnCancelar = el('button', { type: 'button', id: 'btn-cancelar-edicao', className: 'btn btn-secundario', text: 'Cancelar edição', hidden: true });

  const formTarefa = el('form', { id: 'form-tarefa', novalidate: true, className: 'nao-imprimir' },
    tituloForm,
    el('div', { className: 'grade-form' },
      campo('Título da tarefa', titulo, 'largura-total'),
      campo('Estágio', estagio),
      campo('Responsável', resp),
      campo('Data prevista', dataTarefa)
    ),
    el('div', { className: 'acoes' }, btnTarefa, btnCancelar),
    erroTarefa, msgTarefa
  );

  function sairDaEdicao() {
    editandoId = null;
    tituloForm.textContent = 'Nova tarefa';
    btnTarefa.textContent = 'Adicionar tarefa';
    btnCancelar.hidden = true;
    titulo.value = '';
    dataTarefa.value = '';
    limparInvalidos(formTarefa);
  }

  btnCancelar.addEventListener('click', () => {
    sairDaEdicao();
    erroTarefa.textContent = '';
    titulo.focus();
  });

  function entrarNaEdicao(t) {
    editandoId = t.id;
    tituloForm.textContent = 'Editar tarefa';
    btnTarefa.textContent = 'Salvar tarefa';
    btnCancelar.hidden = false;
    titulo.value = t.titulo;
    estagio.value = String(t.estagio);
    resp.value = t.responsavel_id != null && responsaveis.some((r) => r.id === t.responsavel_id) ? String(t.responsavel_id) : '';
    dataTarefa.value = t.data_prevista;
    erroTarefa.textContent = '';
    msgTarefa.textContent = '';
    formTarefa.scrollIntoView({ block: 'start' });
    titulo.focus();
  }

  formTarefa.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    limparInvalidos(formTarefa);
    erroTarefa.textContent = '';
    msgTarefa.textContent = '';
    const t = titulo.value.trim();
    if (!t) return mostrarErro(erroTarefa, 'Título obrigatório', titulo);
    if (t.length > 200) return mostrarErro(erroTarefa, 'Título com até 200 caracteres', titulo);
    if (!dataValida(dataTarefa.value)) return mostrarErro(erroTarefa, 'Data prevista obrigatória', dataTarefa);
    const valores = {
      projeto_id: projeto.id,
      titulo: t,
      estagio: Number(estagio.value),
      responsavel_id: resp.value ? Number(resp.value) : null,
      data_prevista: dataTarefa.value
    };
    btnTarefa.disabled = true;
    try {
      if (editandoId) {
        await editarTarefa(editandoId, valores);
        msgTarefa.textContent = 'Tarefa salva.';
      } else {
        await criarTarefa(valores);
        msgTarefa.textContent = 'Tarefa adicionada.';
      }
      // Mantém estágio e responsável para cadastrar em sequência.
      sairDaEdicao();
      await recarregar();
      titulo.focus();
    } catch (e) {
      mostrarErro(erroTarefa, e);
    } finally {
      btnTarefa.disabled = false;
    }
  });

  // Lista de tarefas agrupadas por estágio.
  const areaTarefas = el('section', { 'aria-label': 'Tarefas por estágio' });

  async function recarregar() {
    try {
      tarefas = await listarTarefas(projeto.id);
      if (meuRender === renderAtual) montarLista();
    } catch (e) {
      mostrarErro(erroTarefa, e);
    }
  }

  async function executar(acao, controle) {
    erroTarefa.textContent = '';
    msgTarefa.textContent = '';
    if (controle) controle.disabled = true;
    try {
      await acao();
      await recarregar();
      return true;
    } catch (e) {
      mostrarErro(erroTarefa, e);
      if (controle) controle.disabled = false;
      return false;
    }
  }

  function montarItem(t, hoje) {
    const sit = situacaoTarefa(t, hoje);
    const classes = [];
    if (t.concluida) classes.push('tarefa-concluida');
    if (sit === 'atrasada') classes.push('tarefa-atrasada');
    if (sit === 'adiantada') classes.push('tarefa-adiantada');
    const textoSit = sit === 'atrasada' ? 'Atrasada' : sit === 'adiantada' ? 'Adiantada' : t.concluida ? 'Concluída no prazo' : 'No prazo';

    const li = el('li', { id: `tarefa-${t.id}`, className: classes.join(' ') || null });
    const meta = `Responsável: ${t.responsavel_nome || 'Sem responsável'} · Prevista: ${formatarData(t.data_prevista)} · ${textoSit}`;
    const info = el('div', { className: 'tarefa-info' },
      el('div', { className: 'tarefa-titulo', text: t.titulo }),
      el('div', { className: 'tarefa-meta', text: meta })
    );

    const chk = el('input', { type: 'checkbox', id: `tarefa-concluir-${t.id}` });
    chk.checked = t.concluida;
    const dataConc = el('input', { type: 'date', id: `tarefa-data-conclusao-${t.id}`, value: t.data_conclusao ?? '' });
    dataConc.disabled = !t.concluida;
    const lblChk = el('label', { for: chk.id, text: 'Concluída' });
    lblChk.style.display = 'inline';
    const lblData = el('label', { for: dataConc.id, className: 'visualmente-oculto', text: `Data de conclusão de ${t.titulo}` });

    chk.addEventListener('change', () => {
      executar(() => concluirTarefa(t.id, chk.checked ? hojeBrasilia() : null), chk).then((ok) => {
        if (ok) document.getElementById(`tarefa-concluir-${t.id}`)?.focus();
        else chk.checked = !chk.checked;
      });
    });
    dataConc.addEventListener('change', () => {
      if (!dataValida(dataConc.value)) {
        mostrarErro(erroTarefa, 'Data de conclusão obrigatória');
        dataConc.value = t.data_conclusao ?? '';
        return;
      }
      executar(() => concluirTarefa(t.id, dataConc.value), dataConc);
    });

    const btnEditar = el('button', { type: 'button', id: `tarefa-editar-${t.id}`, className: 'btn btn-secundario', text: 'Editar', 'aria-label': `Editar ${t.titulo}` });
    btnEditar.addEventListener('click', () => entrarNaEdicao(t));
    const btnExcluir = el('button', { type: 'button', id: `tarefa-excluir-${t.id}`, className: 'btn btn-perigo', text: 'Excluir', 'aria-label': `Excluir ${t.titulo}` });
    btnExcluir.addEventListener('click', () => {
      if (!window.confirm(`Excluir a tarefa "${t.titulo}"?`)) return;
      executar(() => excluirTarefa(t.id, projeto.id), btnExcluir).then((ok) => {
        if (!ok) return;
        if (editandoId === t.id) sairDaEdicao();
        msgTarefa.textContent = 'Tarefa excluída.';
        titulo.focus();
      });
    });

    li.append(info, el('div', { className: 'tarefa-acoes nao-imprimir' }, chk, lblChk, lblData, dataConc, btnEditar, btnExcluir));
    return li;
  }

  function montarLista() {
    const hoje = hojeBrasilia();
    const grupos = ESTAGIOS.map((nome, i) => {
      const n = i + 1;
      const doEstagio = tarefas.filter((t) => t.estagio === n);
      const ul = el('ul', { className: 'lista-tarefas' });
      doEstagio.forEach((t) => ul.append(montarItem(t, hoje)));
      return el('section', { id: `estagio-${n}`, className: 'grupo-estagio', 'aria-labelledby': `estagio-titulo-${n}` },
        el('h3', { id: `estagio-titulo-${n}`, text: `${n}. ${nome} (${doEstagio.length})` }),
        doEstagio.length ? ul : el('p', { className: 'lista-vazia', text: 'Nenhuma tarefa neste estágio.' })
      );
    });
    areaTarefas.replaceChildren(el('h2', { text: 'Tarefas' }), ...grupos);
  }

  montarLista();
  tela.replaceChildren(el('div', { className: 'acoes' }, btnVoltar), h1, formProjeto, formTarefa, areaTarefas);
  foco.focus();
}
