import { ESTEIRA_ATIVA } from './config.js';
import { Diretor } from './diretor.js';
import { Motor } from './motor.js';
import { nuvem } from './nuvem.js';
import { DEMO, roteiroDemo } from './simulador.js';
import { SalaTestes } from './testes.js';
import { UI } from './ui.js';

const $ = (sel) => document.querySelector(sel);

const motor = new Motor($('#escritorio'));
const ui = new UI(motor);
const diretor = new Diretor(motor, ui);
const dlgLogin = $('#dlgLogin');
const ETAPAS_AGUARDANDO = ['aguardando_respostas', 'aguardando_aprovacao_prd', 'aguardando_aprovacao_arquitetura'];
const dlgTestes = $('#dlgTestes');
const salaTestes = SalaTestes.suportado() ? new SalaTestes({ nuvem, iframe: $('#previaApp') }) : null;
let emDemo = false;
let testeEmCurso = null;
const rodadasIniciadas = new Set(); // cada rodada roda sozinha uma vez; depois, pelo botão
const falhasRodada = new Map(); // erro de rede numa rodada em segundo plano: tenta de novo (até 3 vezes)

// ---------- projeto real ----------
// Reabrir = histórico instantâneo no painel + portão pendente (se houver) +
// eventos novos animados, via Realtime com polling de segurança a cada 6s.

let sessao = null; // { id, ultimoId, buscando, parar, timer }

function fecharSessao() {
  if (testeEmCurso && testeEmCurso === sessao?.id && salaTestes) salaTestes.cancelado = true;
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
    if (s === sessao) mostrarProjeto(p);
  } catch (e) {
    // Projeto apagado (o Lucas removeu a linha): volta para o início.
    if (e?.code === 'PGRST116' && s === sessao) {
      fecharSessao();
      diretor.cancelar();
      motor.reiniciar();
      ui.reiniciar();
      ui.registrarSistema('Projeto apagado: app, banco e pasta no GitHub foram removidos.');
      carregarProjetos();
      return;
    }
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
  mostrarProjeto(projeto);

  // Portão ainda sem decisão: reabre ao vivo.
  if (ETAPAS_AGUARDANDO.includes(projeto.etapa)) {
    const pendente = historico.findLast((ev) => ev.tipo === 'portao');
    if (pendente) diretor.enfileirar(pendente);
  }

  s.parar = nuvem.assinar(id, (tipo, novo) => {
    if (tipo === 'projeto') mostrarProjeto(novo);
    else buscarNovos();
  });
  s.timer = setInterval(() => { buscarNovos(); atualizarEstado(); }, 6000);
}

function mostrarProjeto(p) {
  ui.atualizarProjeto(p, { aoRetomar: retomar });
  verificarTestes(p);
}

// ---------- Sala de Testes no navegador ----------
// Quando a esteira chega em testes/navegador, o escritório roda os testes do Igor
// num iframe com a prévia do app e devolve o resultado ao squad-pedir.
// O projeto aberto roda na janela da Sala de Testes; os outros rodam em segundo
// plano, num iframe fora da tela, enquanto o SquadTech estiver aberto e logado.

function verificarTestes(p) {
  const espera = !emDemo && p?.etapa === 'testes' && p.subpasso === 'navegador' && !p.erro;
  $('#projetoTestes').hidden = !espera;
  if (!espera || testeEmCurso) return;
  const chave = `${p.id}:${p.rodada_qa}`;
  if (rodadasIniciadas.has(chave)) return;
  rodadasIniciadas.add(chave);
  rodarTestes(p.id, { nome: p.nome, chave });
}

function itemTeste(t) {
  const li = document.createElement('li');
  li.dataset.id = t.id;
  li.textContent = `${t.id} · ${t.nome}`;
  return li;
}

function avisoFundo(texto) {
  const caixa = $('#avisoTestes');
  caixa.hidden = !texto;
  caixa.textContent = texto ?? '';
}

async function rodarTestes(id = sessao?.id, { nome = '', chave = null } = {}) {
  if (!id || testeEmCurso) return;
  if (!salaTestes) {
    ui.registrarSistema('Este navegador não roda a Sala de Testes (precisa de service worker, em https). Use um Chrome ou Safari atualizado, ou "Pular testes".', { erro: true });
    return;
  }
  const visivel = sessao?.id === id;
  const lista = $('#listaTestes');
  const resumo = $('#resumoTestes');
  const mostrar = (texto) => { if (visivel) resumo.textContent = texto; else avisoFundo(texto); };
  testeEmCurso = id;
  salaTestes.iframe = visivel ? $('#previaApp') : $('#previaFundo');
  try {
    const { testes, rodada, prefixo } = await nuvem.testesPendentes(id);
    if (visivel) {
      $('#metaTestes').textContent = `Rodada ${rodada} · ${testes.length} testes do Igor, mais o carregamento de cada página`;
      lista.replaceChildren();
      if (!dlgTestes.open) dlgTestes.showModal();
    }
    mostrar(visivel ? 'Montando a prévia do app...' : `Sala 4 · preparando os testes de ${nome}...`);
    const resultados = await salaTestes.rodar({ projetoId: id, prefixo, testes }, (i, total, t, r) => {
      if (visivel) {
        let li = lista.querySelector(`[data-id="${CSS.escape(t.id)}"]`);
        if (!li) li = lista.appendChild(itemTeste(t));
        li.dataset.estado = r ? (r.ok ? 'ok' : 'falha') : 'rodando';
        if (r && !r.ok) {
          const det = document.createElement('small');
          det.textContent = `Passo ${r.passo}: ${r.erro}`;
          li.append(det);
        }
        if (!r) li.scrollIntoView({ block: 'nearest' });
      }
      mostrar(visivel ? `Rodando ${i + 1} de ${total}...` : `Sala 4 · testando ${nome} em segundo plano (${i + 1} de ${total})`);
    });
    if (salaTestes.cancelado || (visivel && sessao?.id !== id)) {
      mostrar(visivel ? 'Testes cancelados.' : null);
      return;
    }
    const ok = resultados.filter((r) => r.ok).length;
    mostrar(`${ok} de ${resultados.length} passaram. Enviando para o Igor...`);
    await nuvem.pedir('testes', { id, rodada, testes: resultados });
    if (visivel) {
      resumo.textContent = `${ok} de ${resultados.length} passaram. O Igor já está lendo o resultado.`;
      setTimeout(() => { if (!testeEmCurso && dlgTestes.open) dlgTestes.close(); }, 3000);
    } else {
      avisoFundo(`Sala 4 · ${nome}: ${ok} de ${resultados.length} testes passaram. O Igor já está lendo.`);
      setTimeout(() => { if (!testeEmCurso) avisoFundo(null); }, 8000);
    }
  } catch (e) {
    mostrar(visivel ? `Os testes não rodaram: ${e.message}` : null);
    if (visivel) ui.registrarSistema(`Os testes no navegador não rodaram: ${e.message}`, { erro: true });
    if (chave) {
      const n = (falhasRodada.get(chave) ?? 0) + 1;
      falhasRodada.set(chave, n);
      if (n < 3) rodadasIniciadas.delete(chave); // a próxima verificação tenta de novo
    }
  } finally {
    testeEmCurso = null;
  }
}

// Com o SquadTech aberto e logado, procura projetos esperando testes a cada 20 s.
async function procurarTestesPendentes() {
  if (emDemo || testeEmCurso || !salaTestes || !(await nuvem.usuario())) return;
  try {
    for (const p of await nuvem.projetosEsperandoTestes()) {
      if (p.id === sessao?.id) { verificarTestes(p); return; }
      const chave = `${p.id}:${p.rodada_qa}`;
      if (rodadasIniciadas.has(chave)) continue;
      rodadasIniciadas.add(chave);
      await rodarTestes(p.id, { nome: p.nome, chave });
      return;
    }
  } catch (e) {
    console.warn('falha ao procurar testes pendentes', e);
  }
}
setInterval(procurarTestesPendentes, 20_000);

dlgTestes.addEventListener('close', () => { if (testeEmCurso && testeEmCurso === sessao?.id && salaTestes) salaTestes.cancelado = true; });
$('#btnRodarTestes').addEventListener('click', () => rodarTestes());
$('#btnPularTestes').addEventListener('click', async () => {
  if (!sessao || !confirm('Pular os testes no navegador? O Lucas entrega sem eles e registra isso no relatório.')) return;
  try {
    const { rodada } = await nuvem.testesPendentes(sessao.id);
    await nuvem.pedir('testes', { id: sessao.id, rodada, pulado: true });
    $('#projetoTestes').hidden = true;
  } catch (e) {
    ui.registrarSistema(e.message, { erro: true });
  }
});

// ---------- evolução e remoção ----------

ui.aoPedirAjuste = () => {
  $('#erroAjuste').textContent = '';
  $('#dlgAjuste').showModal();
  $('#textoAjuste').focus();
};

$('#formAjuste').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!sessao) return;
  const botao = e.submitter;
  botao.disabled = true;
  try {
    await nuvem.pedir('evoluir', { id: sessao.id, pedido: $('#textoAjuste').value.trim() });
    $('#textoAjuste').value = '';
    $('#dlgAjuste').close();
  } catch (err) {
    $('#erroAjuste').textContent = err.message;
  } finally {
    botao.disabled = false;
  }
});

ui.aoApagar = (p) => {
  $('#slugApagar').textContent = p.slug;
  $('#confirmaApagar').value = '';
  $('#erroApagar').textContent = '';
  $('#dlgApagar').showModal();
};

$('#formApagar').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!sessao) return;
  const botao = e.submitter;
  botao.disabled = true;
  try {
    await nuvem.pedir('apagar', { id: sessao.id, confirmar: $('#confirmaApagar').value.trim() });
    $('#dlgApagar').close();
    ui.registrarSistema('O Lucas está apagando o projeto. Ele some da lista em instantes.');
  } catch (err) {
    $('#erroApagar').textContent = err.message;
  } finally {
    botao.disabled = false;
  }
});

async function retomar() {
  if (!sessao) return;
  try {
    await nuvem.pedir('retomar', { id: sessao.id });
    $('#projetoErro').hidden = true;
  } catch (e) {
    ui.registrarSistema(e.message, { erro: true });
  }
}

// Zip montado no navegador com a última versão de cada arquivo da entrega.
ui.aoBaixarZip = async () => {
  if (!sessao || !window.JSZip) return;
  try {
    const projeto = await nuvem.projeto(sessao.id);
    const arquivos = await nuvem.arquivosDaEntrega(sessao.id);
    const zip = new window.JSZip();
    const pasta = zip.folder(projeto.slug);
    for (const [caminho, conteudo] of arquivos) pasta.file(caminho, conteudo);
    const blob = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${projeto.slug}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  } catch (e) {
    ui.registrarSistema(`Não consegui montar o zip: ${e.message}`, { erro: true });
  }
};

// Decisões dos portões viram pedidos ao servidor; a esteira continua sozinha.
diretor.aoDecidirPortao = async (ev, decisao) => {
  if (!sessao) return;
  const d = ev.dados ?? {};
  if (d.tipo === 'perguntas') await nuvem.pedir('responder', { id: sessao.id, respostas: decisao.respostas });
  else await nuvem.pedir('decidir', { id: sessao.id, portao: d.tipo, aprovado: decisao.aprovado, comentario: decisao.comentario });
  atualizarPendencias();
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
    ui.renderizarProjetos({ logado: true, membro, projetos, aoAbrir: abrirDaLista });
    ui.renderizarPendencias(projetos, abrirDaLista);
  } catch (err) {
    ui.renderizarProjetos({ logado: true, erro: `Não consegui carregar os projetos: ${err.message}` });
  }
}

function abrirDaLista(id) {
  abrirProjeto(id).catch((e) => ui.registrarSistema(e.message, { erro: true }));
  document.querySelector('.palco')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Painel "O que precisa de você" atualizado junto com a busca de testes pendentes.
async function atualizarPendencias() {
  if (emDemo || !(await nuvem.usuario())) { ui.renderizarPendencias([], abrirDaLista); return; }
  try {
    ui.renderizarPendencias(await nuvem.listarProjetos(), abrirDaLista);
  } catch (e) {
    console.warn('falha ao atualizar pendências', e);
  }
}
setInterval(atualizarPendencias, 20_000);

async function atualizarConta(usuario) {
  ui.emailConta = usuario?.email ?? null;
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
