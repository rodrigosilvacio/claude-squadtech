// Tela Responsáveis (RF2): monta tudo em #tela-responsaveis.
import {
  listarResponsaveis, criarResponsavel, editarResponsavel,
  contarTarefasDoResponsavel, excluirResponsavel
} from './dados.js';

const MSG_SESSAO = 'Sessão expirada. Entre de novo.';
let renderAtual = 0;

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

function textoErro(e) {
  return e instanceof Error ? e.message : String(e || '');
}

function tratarSessao(msg) {
  if (msg === MSG_SESSAO) setTimeout(() => { location.hash = '#login'; }, 800);
}

export async function renderResponsaveis() {
  const tela = document.getElementById('tela-responsaveis');
  if (!tela) return;
  const meuRender = ++renderAtual;

  let responsaveis = [];
  let editandoId = null;
  let excluindo = null;

  const h1 = el('h1', { tabindex: '-1', text: 'Responsáveis' });

  // Formulário (criação e edição)
  const nome = el('input', { type: 'text', id: 'responsavel-nome', maxlength: '80', required: true, autocomplete: 'off' });
  const tituloForm = el('h2', { text: 'Novo responsável' });
  const btnSalvar = el('button', { type: 'submit', id: 'btn-salvar-responsavel', className: 'btn', text: 'Adicionar' });
  const btnCancelar = el('button', { type: 'button', id: 'btn-cancelar-responsavel', className: 'btn btn-secundario', text: 'Cancelar edição', hidden: true });
  const erro = el('p', { id: 'erro-responsavel', role: 'alert', className: 'erro' });
  const msg = el('p', { id: 'responsavel-msg', 'aria-live': 'polite' });

  const form = el('form', { id: 'form-responsavel', novalidate: true },
    tituloForm,
    el('div', { className: 'campo' },
      el('label', { for: 'responsavel-nome', text: 'Nome (até 80 caracteres)' }), nome),
    el('div', { className: 'acoes' }, btnSalvar, btnCancelar),
    erro, msg
  );

  const lista = el('ul', { id: 'lista-responsaveis', 'aria-label': 'Lista de responsáveis' });
  const vazio = el('p', { className: 'lista-vazia', text: 'Nenhum responsável cadastrado.', hidden: true });

  // Diálogo de confirmação
  const confirmaTexto = el('p', { id: 'confirma-texto' });
  const btnConfirmar = el('button', { type: 'button', id: 'btn-confirmar-exclusao', className: 'btn btn-perigo', text: 'Excluir' });
  const btnCancelarExc = el('button', { type: 'button', id: 'btn-cancelar-exclusao', className: 'btn btn-secundario', text: 'Cancelar' });
  const dialogo = el('dialog', { id: 'confirma-exclusao', 'aria-labelledby': 'confirma-texto' },
    confirmaTexto, el('div', { className: 'acoes' }, btnCancelarExc, btnConfirmar));

  function mostrarErro(texto, invalido) {
    erro.textContent = texto;
    if (invalido) {
      nome.setAttribute('aria-invalid', 'true');
      nome.focus();
    }
    tratarSessao(texto);
  }

  function sairDaEdicao() {
    editandoId = null;
    tituloForm.textContent = 'Novo responsável';
    btnSalvar.textContent = 'Adicionar';
    btnCancelar.hidden = true;
    nome.value = '';
    nome.removeAttribute('aria-invalid');
  }

  function entrarNaEdicao(r) {
    editandoId = r.id;
    tituloForm.textContent = 'Editar responsável';
    btnSalvar.textContent = 'Salvar';
    btnCancelar.hidden = false;
    nome.value = r.nome;
    erro.textContent = '';
    msg.textContent = '';
    nome.focus();
  }

  function montarLista() {
    lista.replaceChildren(...responsaveis.map((r) => {
      const btnEditar = el('button', { type: 'button', id: `responsavel-editar-${r.id}`, className: 'btn btn-secundario', text: 'Editar', 'aria-label': `Editar ${r.nome}` });
      btnEditar.addEventListener('click', () => entrarNaEdicao(r));
      const btnExcluir = el('button', { type: 'button', id: `responsavel-excluir-${r.id}`, className: 'btn btn-perigo', text: 'Excluir', 'aria-label': `Excluir ${r.nome}` });
      btnExcluir.addEventListener('click', () => pedirExclusao(r, btnExcluir));
      return el('li', { id: `responsavel-${r.id}` },
        el('span', { text: r.nome }),
        el('span', { className: 'acoes' }, btnEditar, btnExcluir));
    }));
    vazio.hidden = responsaveis.length > 0;
    lista.hidden = responsaveis.length === 0;
  }

  async function recarregar() {
    const dados = await listarResponsaveis();
    if (meuRender !== renderAtual) return;
    responsaveis = dados;
    montarLista();
  }

  async function pedirExclusao(r, botao) {
    erro.textContent = '';
    msg.textContent = '';
    botao.disabled = true;
    try {
      const n = await contarTarefasDoResponsavel(r.id);
      excluindo = { r, botao };
      confirmaTexto.textContent = `Excluir ${r.nome}? ${n} tarefa(s) ficarão Sem responsável.`;
      btnConfirmar.disabled = false;
      if (typeof dialogo.showModal === 'function') dialogo.showModal();
      else dialogo.setAttribute('open', '');
      btnCancelarExc.focus();
    } catch (e) {
      mostrarErro(textoErro(e));
    } finally {
      botao.disabled = false;
    }
  }

  function fecharDialogo() {
    if (dialogo.open) dialogo.close();
    const alvo = excluindo?.botao;
    excluindo = null;
    if (alvo && alvo.isConnected) alvo.focus();
  }

  btnCancelarExc.addEventListener('click', fecharDialogo);
  dialogo.addEventListener('cancel', (ev) => { ev.preventDefault(); fecharDialogo(); });

  btnConfirmar.addEventListener('click', async () => {
    if (!excluindo) return;
    const { r } = excluindo;
    btnConfirmar.disabled = true;
    try {
      await excluirResponsavel(r.id);
      excluindo = null;
      if (dialogo.open) dialogo.close();
      if (editandoId === r.id) sairDaEdicao();
      await recarregar();
      msg.textContent = 'Responsável excluído.';
      nome.focus();
    } catch (e) {
      excluindo = null;
      if (dialogo.open) dialogo.close();
      mostrarErro(textoErro(e));
    } finally {
      btnConfirmar.disabled = false;
    }
  });

  btnCancelar.addEventListener('click', () => {
    sairDaEdicao();
    erro.textContent = '';
    nome.focus();
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    erro.textContent = '';
    msg.textContent = '';
    nome.removeAttribute('aria-invalid');
    const valor = nome.value.trim();
    if (!valor) return mostrarErro('Nome obrigatório', true);
    if (valor.length > 80) return mostrarErro('Nome com até 80 caracteres', true);
    btnSalvar.disabled = true;
    try {
      if (editandoId) {
        await editarResponsavel(editandoId, valor);
        msg.textContent = 'Responsável salvo.';
      } else {
        await criarResponsavel(valor);
        msg.textContent = 'Responsável adicionado.';
      }
      sairDaEdicao();
      await recarregar();
      nome.focus();
    } catch (e) {
      mostrarErro(textoErro(e));
    } finally {
      btnSalvar.disabled = false;
    }
  });

  const carregando = el('p', { 'aria-live': 'polite', text: 'Carregando...' });
  tela.replaceChildren(h1, form, carregando, dialogo);

  try {
    responsaveis = await listarResponsaveis();
  } catch (e) {
    if (meuRender !== renderAtual) return;
    carregando.remove();
    mostrarErro(textoErro(e));
    h1.focus();
    return;
  }
  if (meuRender !== renderAtual) return;

  montarLista();
  tela.replaceChildren(h1, form, el('h2', { text: 'Cadastrados' }), lista, vazio, dialogo);
  nome.focus();
}
