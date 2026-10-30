// Geração e download do CSV de alunos (RF9). Sem dependências.

const BOM = '\uFEFF';
const SEPARADOR = ',';
const QUEBRA = '\r\n';
const CABECALHO = ['nome', 'email'];

// Coloca entre aspas quando há vírgula, aspas ou quebra de linha, duplicando as aspas internas.
function escapar(valor) {
  const texto = String(valor ?? '');
  if (/[",\r\n]/.test(texto)) return '"' + texto.replace(/"/g, '""') + '"';
  return texto;
}

export function gerarCsv(alunos) {
  const lista = Array.isArray(alunos) ? alunos : [];
  const linhas = [CABECALHO.join(SEPARADOR)];
  for (const a of lista) {
    if (!a) continue;
    linhas.push([escapar(a.nome), escapar(a.email)].join(SEPARADOR));
  }
  return BOM + linhas.join(QUEBRA) + QUEBRA;
}

// Data local no formato AAAA-MM-DD.
function dataLocal(data) {
  const d = data instanceof Date && !Number.isNaN(data.getTime()) ? data : new Date();
  const dois = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
}

export function baixarCsv(alunos, data) {
  const conteudo = gerarCsv(alunos);
  const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `alunos-${dataLocal(data)}.csv`;
  link.hidden = true;
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    // Pequeno atraso para o navegador iniciar o download antes de revogar.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
