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
let emAndamento = false;

// ---------- projeto ----------

function iniciarDemo() {
  diretor.cancelar();
  ui.reiniciar();
  ui.iniciarProjeto(DEMO.nome, 'Demonstração');
  $('#velocidadeCaixa').hidden = false;
  emAndamento = true;
  diretor.enfileirar(...roteiroDemo(), { tipo: 'sistema', texto: 'Fim da demonstração. Clique em "Novo projeto" para começar outro.' });
}

function novoProjeto() {
  if (emAndamento && !confirm('Encerrar o projeto atual e voltar ao início? O que está em andamento será descartado.')) return;
  emAndamento = false;
  diretor.cancelar();
  motor.reiniciar();
  ui.reiniciar();
  $('#velocidadeCaixa').hidden = true;
  $('#nomeProjeto').focus();
}

$('#btnDemo').addEventListener('click', iniciarDemo);
$('#btnNovo').addEventListener('click', novoProjeto);
$('#velocidade').addEventListener('change', (e) => diretor.definirVelocidade(Number(e.target.value)));

$('#briefing').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!ESTEIRA_ATIVA) return; // o botão fica desabilitado até a Fase 1
});
if (!ESTEIRA_ATIVA) {
  $('#btnIniciar').disabled = true;
  $('#avisoModo').textContent = 'Fase 0: a esteira real chega na Fase 1. Veja a demonstração com um projeto exemplo.';
}

// ---------- conta ----------

const dlgLogin = $('#dlgLogin');

async function atualizarConta(usuario) {
  $('#btnConta').textContent = usuario ? 'Sair' : 'Entrar';
  $('#btnConta').title = usuario ? `Conectado como ${usuario.email}` : '';
  if (!usuario) {
    ui.renderizarProjetos({ logado: false, aoEntrar: () => dlgLogin.showModal() });
    return;
  }
  try {
    const membro = await nuvem.ehMembro();
    const projetos = membro ? await nuvem.listarProjetos() : [];
    ui.renderizarProjetos({ logado: true, membro, projetos });
  } catch (err) {
    ui.renderizarProjetos({ logado: true, erro: `Não consegui carregar os projetos: ${err.message}` });
  }
}

$('#btnConta').addEventListener('click', async () => {
  if (await nuvem.usuario()) await nuvem.sair();
  else dlgLogin.showModal();
});

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
  ui.renderizarProjetos({ logado: true, erro: 'Não foi possível carregar o cliente do Supabase.' });
}
