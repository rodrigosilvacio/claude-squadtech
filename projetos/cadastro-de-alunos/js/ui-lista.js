// Lista de alunos (RF2, RF7, RF8 e acionamento do RF6). Não importa app.js.
import { semAcento } from './validacao.js';

const MSG_VAZIA = 'Nenhum aluno encontrado';

// Estado da última renderização, usado pela delegação de clique.
let acoesAtuais = { onEditar: null, onExcluir: null };
let alunosPorId = new Map();
let delegacaoRegistrada = false;

export function filtrarAlunos(alunos, termo) {
  const lista = Array.isArray(alunos) ? alunos.filter(Boolean) : [];
  const busca = semAcento(String(termo ?? '').trim());
  if (!busca) return lista.slice();
  return lista.filter((a) =>
    semAcento(a.nome).includes(busca) || semAcento(a.email).includes(busca)
  );
}

export function ordenarAlunos(alunos) {
  const lista = Array.isArray(alunos) ? alunos.filter(Boolean) : [];
  return lista.sort((a, b) =>
    String(a.nome ?? '').localeCompare(String(b.nome ?? ''), 'pt-BR', { sensitivity: 'base' })
  );
}

function textoTotal(n) {
  return n === 1 ? '1 aluno' : `${n} alunos`;
}

function criarBotao(classe, texto, rotulo, id) {
  const botao = document.createElement('button');
  botao.type = 'button';
  botao.className = classe;
  botao.textContent = texto;
  botao.dataset.id = id;
  botao.setAttribute('aria-label', rotulo);
  return botao;
}

function criarItem(aluno) {
  const id = String(aluno.id);
  const nome = String(aluno.nome ?? '');
  const email = String(aluno.email ?? '');

  const li = document.createElement('li');
  li.dataset.id = id;

  const dados = document.createElement('div');
  const spanNome = document.createElement('span');
  spanNome.className = 'aluno-nome';
  spanNome.textContent = nome;
  const spanEmail = document.createElement('span');
  spanEmail.className = 'aluno-email';
  spanEmail.textContent = email;
  dados.append(spanNome, spanEmail);

  const acoes = document.createElement('div');
  acoes.className = 'acoes';

  const contatar = document.createElement('a');
  contatar.className = 'btn-contatar';
  contatar.href = 'mailto:' + email;
  contatar.textContent = 'Contatar';
  contatar.dataset.id = id;
  contatar.setAttribute('aria-label', `Contatar ${nome} por email`);

  acoes.append(
    contatar,
    criarBotao('btn-editar', 'Editar', `Editar ${nome}`, id),
    criarBotao('btn-excluir', 'Excluir', `Excluir ${nome}`, id)
  );

  li.append(dados, acoes);
  return li;
}

function registrarDelegacao(ul) {
  if (delegacaoRegistrada) return;
  delegacaoRegistrada = true;
  ul.addEventListener('click', (evento) => {
    const alvo = evento.target instanceof Element
      ? evento.target.closest('.btn-editar, .btn-excluir')
      : null;
    if (!alvo || !ul.contains(alvo)) return;
    const aluno = alunosPorId.get(String(alvo.dataset.id));
    if (!aluno) return;
    if (alvo.classList.contains('btn-editar')) {
      if (typeof acoesAtuais.onEditar === 'function') acoesAtuais.onEditar(aluno);
    } else if (typeof acoesAtuais.onExcluir === 'function') {
      acoesAtuais.onExcluir(aluno);
    }
  });
}

export function renderizarLista(alunos, acoes = {}) {
  const ul = document.getElementById('lista-alunos');
  const total = document.getElementById('total-alunos');
  const vazia = document.getElementById('lista-vazia');

  const lista = ordenarAlunos(alunos);
  acoesAtuais = { onEditar: acoes?.onEditar ?? null, onExcluir: acoes?.onExcluir ?? null };
  alunosPorId = new Map(lista.map((a) => [String(a.id), a]));

  if (total) total.textContent = textoTotal(lista.length);

  if (vazia) {
    vazia.textContent = MSG_VAZIA;
    vazia.hidden = lista.length > 0;
  }

  if (!ul) return;
  registrarDelegacao(ul);

  const fragmento = document.createDocumentFragment();
  for (const aluno of lista) fragmento.appendChild(criarItem(aluno));
  ul.replaceChildren(fragmento);
  ul.hidden = lista.length === 0;
}
