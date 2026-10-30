import { ESTEIRA_ATIVA } from './config.js';
import { Diretor } from './diretor.js';
import { Motor } from './motor.js';
import { nuvem } from './nuvem.js';
import { DEMO, roteiroDemo } from './simulador.js';
import { UI } from './ui.js';

const $ = (sel) => document.querySelector(sel);

const motor = new Motor($('#escritorio'));
const ui = new UI(motor);
const diretor = new Diretor(motor, ui);
const dlgLogin = $('#dlgLogin');
const ETAPAS_AGUARDANDO = ['aguardando_respostas', 'aguardando_aprovacao_prd'];
let emDemo = false;

// ---------- projeto real ----------
// Reabrir = histórico instantâneo no painel + portão pendente (se houver) +
// eventos novos animados, via Realtime com polling de segurança a cada 6s.

let sessao = null; // { id, ultimoId, buscando, parar, timer }

function fecharSessao() {
  if (!sessao) return;
  sessao.parar?.();
  clearInterval(sessao.timer);
  sessao = null;
}

async function buscarNovos() {
  const s = sessao;
  if (!s || s.buscando) return;
  s.buscando = true;
  try {
    const novos = await nuvem.eventosDesde(s.id, s.ultimoId);
    if (s !== sessao) return;
    for (const ev of novos) {
      s.ultimoId = ev.id;
      diretor.enfileirar(ev);
    }
  } catch (e) {
    console.warn('falha ao buscar eventos', e);
  } finally {
    s.buscando = false;
  }
}

async function atualizarEstado() {
  const s = sessao;
  if (!s) return;
  try {
    const p = await nuvem.projeto(s.id);
    if (s === sessao) ui.atualizarProjeto(p, { aoRetomar: retomar });
  } catch (e) {
    console.warn('falha ao ler o projeto', e);
  }
}

async function abrirProjeto(id) {
  emDemo = false;
  fecharSessao();
  diretor.cancelar();
  motor.reiniciar();
  ui.reiniciar();
  $('#velocidadeCaixa').hidden = true;
  diretor.definirVelocidade(1);

  const projeto = await nuvem.projeto(id);
  ui.iniciarProjeto(projeto.nome, 'Projeto real');
  const s = { id, ultimoId: 0, buscando: false };
  sessao = s;

  const historico = await nuvem.eventosDesde(id, 0);
  if (s !== sessao) return;
  for (const ev of historico) diretor.aplicarInstantaneo(ev);
  s.ultimoId = historico.at(-1)?.id ?? 0;
  ui.atualizarProjeto(projeto, { aoRetomar: retomar });

  // Portão ainda sem decisão: reabre ao vivo.
  if (ETAPAS_AGUARDANDO.includes(projeto.etapa)) {
    const pendente = historico.findLast((ev) => ev.tipo === 'portao');
    if (pendente) diretor.enfileirar(pendente);
  }

  s.parar = nuvem.assinar(id, (tipo, novo) => {
    if (tipo === 'projeto') ui.atualizarProjeto(novo, { aoRetomar: retomar });
    else buscarNovos();
  });
  s.timer = setInterval(() => { buscarNovos(); atualizarEstado(); }, 6000);
}

async function retomar() {
  if (!sessao) return;
  try {
    await nuvem.pedir('retomar', { id: sessao.id });
    $('#projetoErro').hidden = true;
  } catch (e) {
    ui.registrarSistema(e.message, { erro: true });
  }
}

// Decisões dos portões viram pedidos ao servidor; a esteira continua sozinha.
diretor.aoDecidirPortao = async (ev, decisao) => {
  if (!sessao) return;
  const d = ev.dados ?? {};
  if (d.tipo === 'perguntas') await nuvem.pedir('responder', { id: sessao.id, respostas: decisao.respostas });
  else await nuvem.pedir('decidir', { id: sessao.id, portao: d.tipo, aprovado: decisao.aprovado, comentario: decisao.comentario });
};

// ---------- demonstração ----------

function iniciarDemo() {
  fecharSessao();
  diretor.cancelar();
  ui.reiniciar();
  ui.iniciarProjeto(DEMO.nome, 'Demonstração');
  $('#velocidadeCaixa').hidden = false;
  emDemo = true;
  diretor.enfileirar(...roteiroDemo(), { tipo: 'sistema', texto: 'Fim da demonstração. Clique em "Novo projeto" para começar outro.' });
}

function novoProjeto() {
  if (emDemo && diretor.tocando && !confirm('Encerrar a demonstração e voltar ao início?')) return;
  emDemo = false;
  fecharSessao(); // projeto real continua no servidor e fica em "Projetos"
  diretor.cancelar();
  motor.reiniciar();
  ui.reiniciar();
  $('#velocidadeCaixa').hidden = true;
  diretor.definirVelocidade(1);
  $('#nomeProjeto').focus();
}

$('#btnDemo').addEventListener('click', iniciarDemo);
$('#btnNovo').addEventListener('click', novoProjeto);
$('#velocidade').addEventListener('change', (e) => diretor.definirVelocidade(Number(e.target.value)));

$('#briefing').addEventListener('submit', async (e) => {
  e.preventDefault();
  const aviso = $('#avisoModo');
  if (!(await nuvem.usuario())) {
    aviso.textContent = 'Entre com sua conta para iniciar um projeto real.';
    dlgLogin.showModal();
    return;
  }
  const botao = $('#btnIniciar');
  botao.disabled = true;
  aviso.textContent = 'Criando o projeto...';
  try {
    const p = await nuvem.pedir('criar', { nome: $('#nomeProjeto').value.trim(), briefing: $('#textoBriefing').value.trim() });
    aviso.textContent = '';
    $('#nomeProjeto').value = '';
    $('#textoBriefing').value = '';
    await abrirProjeto(p.id);
    carregarProjetos();
  } catch (err) {
    aviso.textContent = err.message;
  } finally {
    botao.disabled = false;
  }
});
if (!ESTEIRA_ATIVA) {
  $('#btnIniciar').disabled = true;
  $('#avisoModo').textContent = 'A esteira real está desligada. Veja a demonstração com um projeto exemplo.';
}

// ---------- conta ----------

async function carregarProjetos() {
  const usuario = await nuvem.usuario();
  if (!usuario) {
    ui.renderizarProjetos({ logado: false, aoEntrar: () => dlgLogin.showModal() });
    return;
  }
  try {
    const membro = await nuvem.ehMembro();
    const projetos = membro ? await nuvem.listarProjetos() : [];
    ui.renderizarProjetos({ logado: true, membro, projetos, aoAbrir: (id) => abrirProjeto(id).catch((e) => ui.registrarSistema(e.message, { erro: true })) });
  } catch (err) {
    ui.renderizarProjetos({ logado: true, erro: `Não consegui carregar os projetos: ${err.message}` });
  }
}

async function atualizarConta(usuario) {
  $('#btnConta').textContent = usuario ? 'Sair' : 'Entrar';
  $('#btnConta').title = usuario ? `Conectado como ${usuario.email}` : '';
  if (!usuario) fecharSessao();
  await carregarProjetos();
}

$('#btnConta').addEventListener('click', async () => {
  if (await nuvem.usuario()) await nuvem.sair();
  else dlgLogin.showModal();
});
document.querySelector('.abas [data-aba="projetos"]').addEventListener('click', carregarProjetos);

$('#formLogin').addEventListener('submit', async (e) => {
  e.preventDefault();
  const erro = $('#erroLogin');
  const botao = e.submitter;
  erro.textContent = '';
  botao.disabled = true;
  try {
    await nuvem.entrar($('#email').value.trim(), $('#senha').value);
    $('#senha').value = '';
    dlgLogin.close();
    $('#avisoModo').textContent = '';
  } catch (err) {
    erro.textContent = err.message;
  } finally {
    botao.disabled = false;
  }
});

if (nuvem.disponivel) {
  nuvem.aoMudarSessao(atualizarConta); // dispara também na carga da página (INITIAL_SESSION)
} else {
  $('#btnConta').disabled = true;
  $('#btnIniciar').disabled = true;
  ui.renderizarProjetos({ logado: true, erro: 'Não foi possível carregar o cliente do Supabase.' });
}
