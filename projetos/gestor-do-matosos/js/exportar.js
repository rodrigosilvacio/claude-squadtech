// Exportação CSV da visão filtrada do resumo (RF14).
import { formatarData, hojeBrasilia } from './regras.js';

const CABECALHO = ['projeto', 'estágio', 'próxima tarefa', 'responsável', 'data prevista', 'status'];
const SEP = ';';
const FIM = '\r\n';

// Coloca o campo entre aspas se tiver separador, aspas ou quebra de linha.
// Também neutraliza fórmulas para que o Excel não execute o conteúdo.
function campo(valor) {
  let s = valor === null || valor === undefined ? '' : String(valor);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[";\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function gerarCsv(linhas) {
  const corpo = (linhas || []).map((l) => [
    l.projeto,
    l.estagio,
    l.proxima_tarefa ?? '',
    l.responsavel ?? '',
    l.data_proxima ? formatarData(l.data_proxima) : '',
    l.situacao_texto ?? ''
  ].map(campo).join(SEP));
  return '\uFEFF' + [CABECALHO.join(SEP), ...corpo].join(FIM) + FIM;
}

export function baixarCsv(linhas) {
  const blob = new Blob([gerarCsv(linhas)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `resumo-${hojeBrasilia()}.csv`;
  a.hidden = true;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
