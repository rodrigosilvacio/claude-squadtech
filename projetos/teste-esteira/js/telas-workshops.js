// Telas de login (RF1), workshops (RF2, RF10, RF12) e inscritos (RF3, RF4, RF5, RF13).
import { entrar } from './supabase.js';
import {
  listarWorkshops, salvarWorkshop, excluirWorkshop, listarSessoes, salvarSessao, excluirSessao,
  listarInscritos, upsertInscrito, excluirParticipante, taxaPresenca, linhasExportacao
} from './dados.js';
import { lerCsv, gerarCsv, baixarArquivo, baixarModelo, emailValido } from './csv.js';

const MSG_GENERICA = 'Algo deu errado. Tente de novo.';
const COLUNAS_CSV = ['nome', 'email', 'empresa', 'sessao', 'data_sessao', 'status', 'horario_checkin', 'origem'];
const LIMITE_ARQUIVO = 1024 * 1024;

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
function botao(texto, classe, id, tipo = 'button') {
  return criar('button', { classe: 'btn ' + (classe || ''), id, texto, attrs: { type: tipo } });
}
function campo(form, id, rotulo, tipo, extra = {}) {
  const c = criar('div', { classe: 'campo' });
  c.appendChild(criar('label', { texto: rotulo, attrs: { for: id } }));
  const i = criar('input', { id, attrs: { type: tipo, ...extra } });
  c.appendChild(i);
  form.appendChild(c);
  return i;
}
function linhaBotoes(filhos) {
  return criar('div', { attrs: { style: 'display:flex;flex-wrap:wrap;gap:0.5rem' } }, filhos);
}
function dois(n) { return String(n).padStart(2, '0'); }
function formatarData(texto) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(texto || ''));
  return m ? m[3] + '/' + m[2] + '/' + m[1] : '';
}
function formatarDataHora(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return dois(d.getDate()) + '/' + dois(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + dois(d.getHours()) + ':' + dois(d.getMinutes());
}
function montarTela(el, id, tituloTexto, voltarHref) {
  el.innerHTML = '';
  const tela = criar('section', { classe: 'tela', id, attrs: { 'aria-labelledby': id + '-titulo' } });
  if (voltarHref) tela.appendChild(criar('div', {}, [criar('a', { classe: 'btn', texto: 'Voltar', attrs: { href: voltarHref } })]));
  const titulo = criar('h1', { id: id + '-titulo', texto: tituloTexto });
  const status = criar('p', { id: id + '-status', attrs: { role: 'status', 'aria-live': 'polite' } });
  tela.append(titulo, status);
  el.appendChild(tela);
  return { tela, titulo, status };
}
function mostrarErro(status, e) {
  status.textContent = '';
  status.appendChild(criar('span', { classe: 'erro', texto: msgErro(e) }));
}

/* ---------- Login ---------- */

export function telaLogin(el) {
  const { tela } = montarTela(el, 'login-tela', 'Entrar');
  const cartao = criar('div', { classe: 'cartao' });
  const form = criar('form', { id: 'login-form', attrs: { novalidate: '' } });
  const inEmail = campo(form, 'login-email', 'E-mail', 'email', { autocomplete: 'email', inputmode: 'email', required: '', maxlength: '254' });
  const inSenha = campo(form, 'login-senha', 'Senha', 'password', { autocomplete: 'current-password', required: '' });
  const msg = criar('p', { classe: 'erro', id: 'login-msg', attrs: { role: 'alert' } });
  const btn = botao('Entrar', 'btn-primario btn-grande', 'login-enviar', 'submit');
  form.append(msg, btn);
  cartao.appendChild(form);
  tela.appendChild(cartao);

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    msg.textContent = '';
    if (!emailValido(inEmail.value)) { msg.textContent = 'Digite um e-mail válido.'; inEmail.focus(); return; }
    if (!inSenha.value) { msg.textContent = 'Digite sua senha.'; inSenha.focus(); return; }
    btn.disabled = true;
    try {
      await entrar(inEmail.value, inSenha.value);
      location.hash = '#/workshops';
    } catch (e) {
      msg.textContent = msgErro(e);
      btn.disabled = false;
    }
  });
  inEmail.focus();
}

/* ---------- Lista de workshops ---------- */

export async function telaWorkshops(el) {
  const { tela, status } = montarTela(el, 'wk-tela', 'Workshops');

  const cartao = criar('section', { classe: 'cartao', attrs: { 'aria-labelledby': 'wk-novo-titulo' } });
  cartao.appendChild(criar('h2', { id: 'wk-novo-titulo', texto: 'Novo workshop' }));
  const form = criar('form', { id: 'wk-form', attrs: { novalidate: '' } });
  const inNome = campo(form, 'wk-nome', 'Nome', 'text', { required: '', maxlength: '200', autocomplete: 'off' });
  const inData = campo(form, 'wk-data', 'Data', 'date', { required: '' });
  const msg = criar('p', { classe: 'erro', id: 'wk-form-msg', attrs: { role: 'alert' } });
  const btn = botao('Criar workshop', 'btn-primario btn-grande', 'wk-criar', 'submit');
  form.append(msg, btn);
  cartao.appendChild(form);

  const lista = criar('ul', { classe: 'lista', id: 'wk-lista', attrs: { 'aria-label': 'Workshops' } });
  tela.append(cartao, lista);

  async function carregar() {
    status.textContent = 'Carregando...';
    try {
      const workshops = await listarWorkshops();
      if (!el.contains(tela)) return;
      lista.textContent = '';
      status.textContent = workshops.length ? '' : 'Nenhum workshop ainda. Crie o primeiro acima.';
      for (const w of workshops) {
        const li = criar('li', { classe: 'item' });
        const info = criar('div');
        info.appendChild(criar('strong', {}, [criar('a', { texto: w.nome, attrs: { href: '#/workshop/' + encodeURIComponent(w.id) } })]));
        info.appendChild(criar('div', { texto: formatarData(w.data) }));
        const excluir = botao('Excluir', 'btn-perigo');
        excluir.setAttribute('aria-label', 'Excluir o workshop ' + w.nome);
        excluir.addEventListener('click', async () => {
          if (!confirm('Excluir o workshop ' + w.nome + ' com sessões e presenças?')) return;
          excluir.disabled = true;
          try {
            await excluirWorkshop(w.id);
            avisarSessoes();
            avisar('Workshop excluído.', 'sucesso');
            await carregar();
          } catch (e) {
            avisar(msgErro(e), 'erro');
            excluir.disabled = false;
          }
        });
        li.append(info, excluir);
        lista.appendChild(li);
      }
    } catch (e) {
      mostrarErro(status, e);
    }
  }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    msg.textContent = '';
    if (!inNome.value.trim()) { msg.textContent = 'Nome é obrigatório.'; inNome.focus(); return; }
    if (!inData.value) { msg.textContent = 'Informe uma data válida.'; inData.focus(); return; }
    btn.disabled = true;
    try {
      const w = await salvarWorkshop({ nome: inNome.value, data: inData.value });
      location.hash = '#/workshop/' + encodeURIComponent(w.id);
    } catch (e) {
      msg.textContent = msgErro(e);
      btn.disabled = false;
    }
  });

  await carregar();
}

/* ---------- Detalhe do workshop ---------- */

export async function telaWorkshop(el, id) {
  const { tela, titulo, status } = montarTela(el, 'wk-detalhe', 'Workshop', '#/workshops');
  status.textContent = 'Carregando...';

  let workshop;
  try {
    workshop = (await listarWorkshops()).find((w) => w.id === id);
    if (!workshop) throw new Error('Workshop não encontrado.');
  } catch (e) {
    mostrarErro(status, e);
    return;
  }
  if (!el.contains(tela)) return;
  status.textContent = '';

  const subtitulo = criar('p', { id: 'wk-detalhe-data' });
  function renderCabecalho() {
    titulo.textContent = workshop.nome;
    subtitulo.textContent = 'Data: ' + formatarData(workshop.data);
  }
  renderCabecalho();

  const btnExportar = botao('Exportar CSV', 'btn-primario', 'wk-exportar');
  const acoes = linhaBotoes([
    criar('a', { classe: 'btn', id: 'wk-inscritos', texto: 'Inscritos', attrs: { href: '#/workshop/' + encodeURIComponent(id) + '/inscritos' } }),
    btnExportar
  ]);

  // Edição do workshop
  const det = criar('details', { classe: 'cartao', id: 'wk-editar' });
  det.appendChild(criar('summary', { texto: 'Editar workshop' }));
  const formEd = criar('form', { id: 'wk-editar-form', attrs: { novalidate: '' } });
  const edNome = campo(formEd, 'wk-editar-nome', 'Nome', 'text', { required: '', maxlength: '200', autocomplete: 'off' });
  const edData = campo(formEd, 'wk-editar-data', 'Data', 'date', { required: '' });
  edNome.value = workshop.nome;
  edData.value = workshop.data;
  const msgEd = criar('p', { classe: 'erro', id: 'wk-editar-msg', attrs: { role: 'alert' } });
  const btnEd = botao('Salvar', 'btn-primario btn-grande', 'wk-editar-salvar', 'submit');
  formEd.append(msgEd, btnEd);
  det.appendChild(formEd);

  // Taxa de presença
  const cartaoTaxa = criar('section', { classe: 'cartao', id: 'wk-taxa', attrs: { 'aria-labelledby': 'wk-taxa-titulo' } });
  cartaoTaxa.appendChild(criar('h2', { id: 'wk-taxa-titulo', texto: 'Taxa de presença' }));
  const taxaConteudo = criar('div', { id: 'wk-taxa-conteudo' });
  cartaoTaxa.appendChild(taxaConteudo);

  // Sessões
  const cartaoSes = criar('section', { classe: 'cartao', attrs: { 'aria-labelledby': 'wk-sessoes-titulo' } });
  cartaoSes.appendChild(criar('h2', { id: 'wk-sessoes-titulo', texto: 'Sessões' }));
  const listaSes = criar('ul', { classe: 'lista', id: 'wk-sessoes' });
  const formSes = criar('form', { id: 'wk-sessao-form', attrs: { novalidate: '' } });
  formSes.appendChild(criar('h3', { texto: 'Nova sessão' }));
  const sNome = campo(formSes, 'wk-sessao-nome', 'Nome da sessão', 'text', { required: '', maxlength: '200', autocomplete: 'off' });
  const sInicio = campo(formSes, 'wk-sessao-inicio', 'Data e hora de início', 'datetime-local', { required: '' });
  const msgSes = criar('p', { classe: 'erro', id: 'wk-sessao-msg', attrs: { role: 'alert' } });
  const btnSes = botao('Criar sessão', 'btn-primario btn-grande', 'wk-sessao-criar', 'submit');
  formSes.append(msgSes, btnSes);
  cartaoSes.append(listaSes, formSes);

  tela.append(subtitulo, acoes, cartaoTaxa, cartaoSes, det);

  async function carregarTaxa() {
    taxaConteudo.textContent = 'Carregando...';
    try {
      const t = await taxaPresenca(id);
      taxaConteudo.textContent = '';
      if (!t.porSessao.length) {
        taxaConteudo.appendChild(criar('p', { texto: 'A taxa aparece depois que uma sessão for encerrada.' }));
        return;
      }
      taxaConteudo.appendChild(criar('p', { classe: 'contador', texto: 'Total: ' + t.total + '%' }));
      const ul = criar('ul', { classe: 'lista' });
      for (const item of t.porSessao) {
        ul.appendChild(criar('li', { classe: 'item' }, [
          criar('span', { texto: item.sessao.nome }),
          criar('strong', { texto: item.taxa + '%' })
        ]));
      }
      taxaConteudo.appendChild(ul);
    } catch (e) {
      mostrarErro(taxaConteudo, e);
    }
  }

  async function carregarSessoes() {
    try {
      const sessoes = await listarSessoes(id);
      if (!el.contains(tela)) return;
      listaSes.textContent = '';
      if (!sessoes.length) {
        listaSes.appendChild(criar('li', { classe: 'item', texto: 'Nenhuma sessão ainda.' }));
        return;
      }
      for (const s of sessoes) {
        const li = criar('li', { classe: 'item' });
        const info = criar('div');
        info.appendChild(criar('strong', {}, [criar('a', { texto: s.nome, attrs: { href: '#/sessao/' + encodeURIComponent(s.id) } })]));
        const inicio = formatarDataHora(s.inicio);
        info.appendChild(criar('div', { texto: (inicio ? inicio + ' · ' : '') + (s.aberta ? 'Aberta' : 'Encerrada') }));
        const botoes = [criar('a', { classe: 'btn btn-primario', texto: s.aberta ? 'Check-in' : 'Abrir', attrs: { href: '#/sessao/' + encodeURIComponent(s.id), 'aria-label': 'Abrir a sessão ' + s.nome } })];
        if (!s.aberta) botoes.push(criar('a', { classe: 'btn', texto: 'Faltantes', attrs: { href: '#/sessao/' + encodeURIComponent(s.id) + '/faltantes', 'aria-label': 'Faltantes da sessão ' + s.nome } }));
        const excluir = botao('Excluir', 'btn-perigo');
        excluir.setAttribute('aria-label', 'Excluir a sessão ' + s.nome);
        excluir.addEventListener('click', async () => {
          if (!confirm('Excluir a sessão ' + s.nome + ' e suas presenças?')) return;
          excluir.disabled = true;
          try {
            await excluirSessao(s.id);
            avisarSessoes();
            avisar('Sessão excluída.', 'sucesso');
            await Promise.all([carregarSessoes(), carregarTaxa()]);
          } catch (e) {
            avisar(msgErro(e), 'erro');
            excluir.disabled = false;
          }
        });
        botoes.push(excluir);
        li.append(info, linhaBotoes(botoes));
        listaSes.appendChild(li);
      }
    } catch (e) {
      listaSes.textContent = '';
      listaSes.appendChild(criar('li', { classe: 'item erro', texto: msgErro(e) }));
    }
  }

  formEd.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    msgEd.textContent = '';
    btnEd.disabled = true;
    try {
      workshop = await salvarWorkshop({ id, nome: edNome.value, data: edData.value });
      renderCabecalho();
      det.open = false;
      avisar('Workshop atualizado.', 'sucesso');
    } catch (e) {
      msgEd.textContent = msgErro(e);
    } finally {
      btnEd.disabled = false;
    }
  });

  formSes.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    msgSes.textContent = '';
    if (!sNome.value.trim()) { msgSes.textContent = 'Nome da sessão é obrigatório.'; sNome.focus(); return; }
    if (!sInicio.value) { msgSes.textContent = 'Informe data e hora de início.'; sInicio.focus(); return; }
    btnSes.disabled = true;
    try {
      await salvarSessao({ workshop_id: id, nome: sNome.value, inicio: sInicio.value });
      formSes.reset();
      avisarSessoes();
      avisar('Sessão criada.', 'sucesso');
      await carregarSessoes();
    } catch (e) {
      msgSes.textContent = msgErro(e);
    } finally {
      btnSes.disabled = false;
    }
  });

  btnExportar.addEventListener('click', async () => {
    btnExportar.disabled = true;
    try {
      const linhas = await linhasExportacao(id);
      if (!linhas.length) { avisar('Nada para exportar: cadastre sessões e inscritos.', 'info'); return; }
      const nome = 'presenca-' + workshop.nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + workshop.data + '.csv';
      baixarArquivo(nome, gerarCsv(linhas, COLUNAS_CSV));
    } catch (e) {
      avisar(msgErro(e), 'erro');
    } finally {
      btnExportar.disabled = false;
    }
  });

  await Promise.all([carregarSessoes(), carregarTaxa()]);
}

/* ---------- Inscritos ---------- */

export async function telaInscritos(el, workshopId) {
  const voltar = '#/workshop/' + encodeURIComponent(workshopId);
  const { tela, titulo, status } = montarTela(el, 'insc-tela', 'Inscritos', voltar);

  // Importação
  const cartaoImp = criar('section', { classe: 'cartao', attrs: { 'aria-labelledby': 'insc-imp-titulo' } });
  cartaoImp.appendChild(criar('h2', { id: 'insc-imp-titulo', texto: 'Importar planilha' }));
  cartaoImp.appendChild(criar('p', { texto: 'Arquivo CSV em UTF-8 com cabeçalho nome,email,empresa, separado por vírgula ou ponto e vírgula.' }));
  const btnModelo = botao('Baixar modelo', '', 'insc-modelo');
  const formImp = criar('form', { id: 'insc-imp-form', attrs: { novalidate: '' } });
  const inArquivo = campo(formImp, 'insc-arquivo', 'Arquivo CSV', 'file', { accept: '.csv,text/csv' });
  const btnImp = botao('Importar', 'btn-primario btn-grande', 'insc-importar', 'submit');
  formImp.appendChild(btnImp);
  const relatorio = criar('div', { classe: 'relatorio oculto', id: 'insc-relatorio', attrs: { 'aria-live': 'polite' } });
  cartaoImp.append(linhaBotoes([btnModelo]), formImp, relatorio);

  // Adicionar manualmente
  const det = criar('details', { classe: 'cartao', id: 'insc-adicionar' });
  det.appendChild(criar('summary', { texto: 'Adicionar participante' }));
  const formAdd = criar('form', { id: 'insc-form', attrs: { novalidate: '' } });
  const inNome = campo(formAdd, 'insc-nome', 'Nome', 'text', { required: '', maxlength: '200', autocomplete: 'off' });
  const inEmail = campo(formAdd, 'insc-email', 'E-mail', 'email', { required: '', maxlength: '254', inputmode: 'email', autocomplete: 'off' });
  const inEmpresa = campo(formAdd, 'insc-empresa', 'Empresa (opcional)', 'text', { maxlength: '200', autocomplete: 'off' });
  const msgAdd = criar('p', { classe: 'erro', id: 'insc-form-msg', attrs: { role: 'alert' } });
  const btnAdd = botao('Adicionar', 'btn-primario btn-grande', 'insc-form-enviar', 'submit');
  formAdd.append(msgAdd, btnAdd);
  det.appendChild(formAdd);

  const contador = criar('p', { classe: 'contador', id: 'insc-contador' });
  const lista = criar('ul', { classe: 'lista', id: 'insc-lista', attrs: { 'aria-label': 'Inscritos' } });
  tela.append(cartaoImp, det, contador, lista);

  listarWorkshops()
    .then((ws) => { const w = ws.find((x) => x.id === workshopId); if (w && el.contains(tela)) titulo.textContent = 'Inscritos: ' + w.nome; })
    .catch(() => {});

  async function carregar() {
    status.textContent = 'Carregando...';
    try {
      const inscritos = await listarInscritos(workshopId);
      if (!el.contains(tela)) return;
      status.textContent = '';
      contador.textContent = inscritos.length + (inscritos.length === 1 ? ' inscrito' : ' inscritos');
      lista.textContent = '';
      if (!inscritos.length) {
        lista.appendChild(criar('li', { classe: 'item', texto: 'Nenhum inscrito ainda. Importe a planilha ou adicione acima.' }));
        return;
      }
      for (const p of inscritos) {
        const li = criar('li', { classe: 'item' });
        const info = criar('div');
        info.appendChild(criar('strong', {}, [criar('a', { texto: p.nome, attrs: { href: '#/participante/' + encodeURIComponent(p.id) } })]));
        info.appendChild(criar('div', { texto: p.email + (p.empresa ? ' · ' + p.empresa : '') }));
        const excluir = botao('Excluir', 'btn-perigo');
        excluir.setAttribute('aria-label', 'Excluir ' + p.nome);
        excluir.addEventListener('click', async () => {
          if (!confirm('Excluir ' + p.nome + ' e todas as presenças? Isso não pode ser desfeito.')) return;
          excluir.disabled = true;
          try {
            await excluirParticipante(p.id);
            avisar('Participante excluído.', 'sucesso');
            await carregar();
          } catch (e) {
            avisar(msgErro(e), 'erro');
            excluir.disabled = false;
          }
        });
        li.append(info, excluir);
        lista.appendChild(li);
      }
    } catch (e) {
      mostrarErro(status, e);
    }
  }

  function mostrarRelatorio(inseridos, atualizados, rejeitadas) {
    relatorio.textContent = '';
    relatorio.classList.remove('oculto');
    relatorio.appendChild(criar('h3', { texto: 'Resultado da importação' }));
    relatorio.appendChild(criar('p', { texto: 'Inseridos: ' + inseridos + ' · Atualizados: ' + atualizados + ' · Rejeitados: ' + rejeitadas.length }));
    if (rejeitadas.length) {
      const ul = criar('ul');
      rejeitadas.sort((a, b) => a.linha - b.linha)
        .forEach((r) => ul.appendChild(criar('li', { texto: 'Linha ' + r.linha + ': ' + r.motivo })));
      relatorio.appendChild(ul);
    }
  }

  btnModelo.addEventListener('click', () => baixarModelo());

  formImp.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const arquivo = inArquivo.files && inArquivo.files[0];
    if (!arquivo) { avisar('Escolha um arquivo CSV.', 'erro'); inArquivo.focus(); return; }
    if (arquivo.size > LIMITE_ARQUIVO) { avisar('Arquivo muito grande. O limite é 1 MB.', 'erro'); return; }
    btnImp.disabled = true;
    relatorio.classList.remove('oculto');
    relatorio.textContent = 'Importando...';
    try {
      const { linhas, rejeitadas } = lerCsv(await arquivo.text());
      if (!linhas.length && !rejeitadas.length) {
        relatorio.textContent = 'O arquivo está vazio ou sem linhas de dados.';
        return;
      }
      let inseridos = 0;
      let atualizados = 0;
      // Sequencial para não sobrecarregar e manter o relatório fiel por linha.
      for (const l of linhas) {
        try {
          const r = await upsertInscrito(workshopId, l);
          if (r === 'atualizado') atualizados++; else inseridos++;
        } catch (e) {
          rejeitadas.push({ linha: l.numero, motivo: msgErro(e) });
        }
      }
      mostrarRelatorio(inseridos, atualizados, rejeitadas);
      formImp.reset();
      await carregar();
    } catch (e) {
      relatorio.textContent = '';
      relatorio.appendChild(criar('p', { classe: 'erro', texto: 'Não foi possível ler o arquivo. Confira se é um CSV em UTF-8.' }));
    } finally {
      btnImp.disabled = false;
    }
  });

  formAdd.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    msgAdd.textContent = '';
    if (!inNome.value.trim()) { msgAdd.textContent = 'Nome é obrigatório.'; inNome.focus(); return; }
    if (!emailValido(inEmail.value)) { msgAdd.textContent = 'Digite um e-mail válido.'; inEmail.focus(); return; }
    btnAdd.disabled = true;
    try {
      const r = await upsertInscrito(workshopId, { nome: inNome.value, email: inEmail.value, empresa: inEmpresa.value });
      formAdd.reset();
      avisar(r === 'atualizado' ? 'Participante já existia e foi atualizado.' : 'Participante adicionado.', 'sucesso');
      await carregar();
      inNome.focus();
    } catch (e) {
      msgAdd.textContent = msgErro(e);
    } finally {
      btnAdd.disabled = false;
    }
  });

  await carregar();
}
