// Regras de negócio puras do Gestor do MatosOS (sem DOM, sem rede).
// Datas de calendário: 'aaaa-mm-dd' comparadas como string. Fuso: America/Sao_Paulo.

export const ESTAGIOS = ['Briefing', 'Planejamento', 'Execução', 'Revisão', 'Entrega'];

const FUSO = 'America/Sao_Paulo';
const DIAS_ALERTA = 7;

const fmtDiaISO = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit'
});
const fmtHora = new Intl.DateTimeFormat('en-GB', {
  timeZone: FUSO, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});

const TEXTO_SITUACAO = {
  atrasado: 'Atrasado',
  no_prazo: 'No prazo',
  adiantado: 'Adiantado',
  concluido_no_prazo: 'Concluído no prazo',
  concluido_com_atraso: 'Concluído com atraso'
};

function ehDataCalendario(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

// Converte instante (Date ou ISO) em 'aaaa-mm-dd' de Brasília.
function diaBrasilia(instante) {
  const d = instante instanceof Date ? instante : new Date(instante);
  if (Number.isNaN(d.getTime())) return '';
  return fmtDiaISO.format(d);
}

export function hojeBrasilia() {
  return diaBrasilia(new Date());
}

// Aceita 'aaaa-mm-dd' (sem converter fuso) ou ISO completo (convertido para Brasília).
export function formatarData(iso) {
  if (!iso) return '';
  const s = String(iso);
  const dia = ehDataCalendario(s) ? s : (ehDataCalendario(s.slice(0, 10)) && s.length === 10 ? s : diaBrasilia(s));
  if (!ehDataCalendario(dia)) return '';
  const [a, m, d] = dia.split('-');
  return `${d}/${m}/${a}`;
}

export function formatarDataHora(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${formatarData(diaBrasilia(d))} ${fmtHora.format(d)}`;
}

// Número de dias de calendário (Brasília) entre dois 'aaaa-mm-dd'.
function diferencaDias(de, ate) {
  const [a1, m1, d1] = de.split('-').map(Number);
  const [a2, m2, d2] = ate.split('-').map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000);
}

// Dias de calendário de Brasília desde o instante (ou data) até hoje.
export function diasDesde(iso, hoje = hojeBrasilia()) {
  if (!iso) return 0;
  const s = String(iso);
  const dia = ehDataCalendario(s) ? s : diaBrasilia(s);
  if (!ehDataCalendario(dia) || !ehDataCalendario(hoje)) return 0;
  return Math.max(0, diferencaDias(dia, hoje));
}

function compararCriacao(a, b) {
  const ca = String(a.criado_em || '');
  const cb = String(b.criado_em || '');
  const ta = Date.parse(ca);
  const tb = Date.parse(cb);
  if (!Number.isNaN(ta) && !Number.isNaN(tb) && ta !== tb) return ta - tb;
  if (Number.isNaN(ta) || Number.isNaN(tb)) {
    if (ca < cb) return -1;
    if (ca > cb) return 1;
  }
  return Number(a.id) - Number(b.id);
}

// RF6: pendente com menor data prevista; desempate por criado_em e id.
export function proximaTarefa(tarefas) {
  const pendentes = (tarefas || []).filter((t) => t && !t.concluida);
  if (!pendentes.length) return null;
  pendentes.sort((a, b) => {
    if (a.data_prevista < b.data_prevista) return -1;
    if (a.data_prevista > b.data_prevista) return 1;
    return compararCriacao(a, b);
  });
  return pendentes[0];
}

// RF8: atrasada só depois do fim do dia previsto (data_prevista < hoje).
export function situacaoTarefa(t, hoje = hojeBrasilia()) {
  if (!t) return 'no_prazo';
  if (!t.concluida) return t.data_prevista < hoje ? 'atrasada' : 'no_prazo';
  if (t.data_conclusao && t.data_conclusao < t.data_prevista) return 'adiantada';
  return 'no_prazo';
}

function nomeEstagio(n) {
  return ESTAGIOS[Number(n) - 1] || '';
}

export function resumirProjeto(p, tarefas, hoje = hojeBrasilia()) {
  const lista = (tarefas || []).filter((t) => t && Number(t.projeto_id) === Number(p.id));
  const proxima = proximaTarefa(lista);
  const semTarefas = lista.length === 0;
  const ativo = semTarefas || proxima !== null;

  let estagio;
  let situacao;
  if (semTarefas) {
    estagio = 'Sem tarefas';
    situacao = 'no_prazo';
  } else if (ativo) {
    estagio = nomeEstagio(proxima.estagio);
    // RF9: qualquer tarefa atrasada torna o projeto atrasado.
    situacao = lista.some((t) => situacaoTarefa(t, hoje) === 'atrasada') ? 'atrasado' : 'no_prazo';
  } else {
    estagio = 'Concluído';
    // Conclusão do projeto = maior data_conclusao entre as tarefas.
    const fim = lista.reduce((m, t) => (t.data_conclusao && t.data_conclusao > m ? t.data_conclusao : m), '');
    if (!fim || fim === p.data_prevista) situacao = 'concluido_no_prazo';
    else situacao = fim < p.data_prevista ? 'adiantado' : 'concluido_com_atraso';
  }

  let responsavel = '';
  if (proxima) responsavel = proxima.responsavel_id != null && proxima.responsavel_nome ? proxima.responsavel_nome : 'Sem responsável';

  const dias = diasDesde(p.atualizado_em, hoje);

  return {
    id: Number(p.id),
    projeto: p.nome,
    estagio,
    proxima_tarefa: proxima ? proxima.titulo : null,
    responsavel,
    data_proxima: proxima ? proxima.data_prevista : null,
    situacao,
    situacao_texto: TEXTO_SITUACAO[situacao],
    ativo,
    incompleto: ativo && (semTarefas || proxima.responsavel_id == null),
    atualizado_em: p.atualizado_em,
    dias_sem_atualizacao: dias,
    desatualizado: ativo && dias > DIAS_ALERTA,
    // Auxiliar para ordenar concluídos (não faz parte do contrato visual).
    _data_ref: ativo ? null : p.data_prevista
  };
}

function cmpTexto(a, b) {
  return String(a || '').localeCompare(String(b || ''), 'pt-BR');
}

// RF10: ativos atrasados, demais ativos por data da próxima tarefa, sem tarefas no fim; concluídos depois.
export function ordenarResumo(linhas) {
  const grupo = (l) => {
    if (!l.ativo) return 3;
    if (l.data_proxima === null) return 2;
    return l.situacao === 'atrasado' ? 0 : 1;
  };
  return [...(linhas || [])].sort((a, b) => {
    const g = grupo(a) - grupo(b);
    if (g) return g;
    const da = a.ativo ? a.data_proxima : a._data_ref;
    const db = b.ativo ? b.data_proxima : b._data_ref;
    if (da && db && da !== db) return da < db ? -1 : 1;
    return cmpTexto(a.projeto, b.projeto) || a.id - b.id;
  });
}

// RF11
export function filtrarResumo(linhas, filtro = 'ativos') {
  const l = linhas || [];
  switch (filtro) {
    case 'atrasado': return l.filter((x) => x.ativo && x.situacao === 'atrasado');
    case 'no_prazo': return l.filter((x) => x.ativo && x.situacao === 'no_prazo');
    case 'concluidos': return l.filter((x) => !x.ativo);
    default: return l.filter((x) => x.ativo);
  }
}

// RF12: conta só projetos ativos marcados como Incompleto.
export function contarIncompletos(linhas) {
  return (linhas || []).filter((l) => l.ativo && l.incompleto).length;
}

/*
Casos de teste (critérios de aceite):
- RF6: duas pendentes com data 2026-11-10, A criada antes de B -> proximaTarefa = A.
- RF7: próxima tarefa estagio 4 -> resumirProjeto(...).estagio = 'Revisão'.
- RF7: projeto sem tarefas -> estagio 'Sem tarefas', situacao 'no_prazo', ativo true, incompleto true.
- RF8: pendente prevista 2026-10-29, hoje '2026-10-30' -> 'atrasada'; hoje '2026-10-29' -> 'no_prazo'.
- RF8: prevista 2026-11-05, concluída 2026-11-01 -> 'adiantada'.
- RF9: 12 tarefas, 1 pendente prevista antes de hoje -> situacao 'atrasado'.
- RF9: projeto previsto 2026-11-30, última conclusão 2026-11-20 -> 'adiantado', ativo false, fora de 'ativos'.
- RF10: ordenarResumo coloca 'atrasado' antes de 'no_prazo'; sem tarefas no fim dos ativos.
- RF11: filtro 'concluidos' nunca inclui projeto sem tarefas (ativo true).
- RF12: próxima com responsavel_id null -> incompleto true; contarIncompletos soma 1.
- RF16: atualizado_em há 8 dias -> dias_sem_atualizacao 8, desatualizado true; 7 dias -> false.
- formatarDataHora('2026-11-02T17:30:00Z') -> '02/11/2026 14:30'.
*/
