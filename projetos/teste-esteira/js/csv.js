// CSV: leitura com detecção de separador e validação, geração (UTF-8 com BOM, ponto e vírgula) e download.
// Este módulo não importa nada.

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Valida e-mail com a regra única do app. Aceita o valor cru e normaliza antes. */
export function emailValido(e) {
  const v = String(e == null ? '' : e).trim().toLowerCase();
  return v.length <= 254 && REGEX_EMAIL.test(v);
}

function normalizar(e) {
  return String(e == null ? '' : e).trim().toLowerCase();
}

// Conta separadores fora de aspas na primeira linha para decidir entre ';' e ','.
function detectarSeparador(texto) {
  let pv = 0;
  let virgula = 0;
  let emAspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (c === '"') emAspas = !emAspas;
    else if (!emAspas && (c === '\n' || c === '\r')) break;
    else if (!emAspas && c === ';') pv++;
    else if (!emAspas && c === ',') virgula++;
  }
  return pv > virgula ? ';' : ',';
}

// Divide o texto em registros, respeitando aspas (inclusive quebras de linha dentro delas).
// Cada registro guarda o número da linha do arquivo onde começa.
function dividirRegistros(texto, sep) {
  const registros = [];
  let campos = [];
  let campo = '';
  let emAspas = false;
  let linhaAtual = 1;
  let linhaInicio = 1;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (emAspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; }
        else emAspas = false;
      } else {
        if (c === '\n') linhaAtual++;
        campo += c;
      }
      continue;
    }
    if (c === '"') {
      emAspas = true;
    } else if (c === sep) {
      campos.push(campo);
      campo = '';
    } else if (c === '\r' || c === '\n') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      campos.push(campo);
      registros.push({ campos, numero: linhaInicio });
      campos = [];
      campo = '';
      linhaAtual++;
      linhaInicio = linhaAtual;
    } else {
      campo += c;
    }
  }
  if (campo !== '' || campos.length > 0) {
    campos.push(campo);
    registros.push({ campos, numero: linhaInicio });
  }
  return registros;
}

function registroVazio(campos) {
  return campos.every((c) => String(c).trim() === '');
}

/**
 * Lê o CSV de inscritos (cabeçalho nome,email,empresa em qualquer ordem e caixa).
 * numero = linha no arquivo, com o cabeçalho na linha 1.
 */
export function lerCsv(texto) {
  const resultado = { linhas: [], rejeitadas: [] };
  let conteudo = String(texto == null ? '' : texto);
  if (conteudo.charCodeAt(0) === 0xfeff) conteudo = conteudo.slice(1);
  if (!conteudo.trim()) return resultado;

  const sep = detectarSeparador(conteudo);
  const registros = dividirRegistros(conteudo, sep);

  // Primeiro registro não vazio é o cabeçalho.
  let idxCab = registros.findIndex((r) => !registroVazio(r.campos));
  if (idxCab < 0) return resultado;
  const cab = registros[idxCab].campos.map((c) => c.trim().toLowerCase());
  const iNome = cab.indexOf('nome');
  const iEmail = cab.indexOf('email') >= 0 ? cab.indexOf('email') : cab.indexOf('e-mail');
  const iEmpresa = cab.indexOf('empresa');

  const vistos = new Set();
  for (let r = idxCab + 1; r < registros.length; r++) {
    const { campos, numero } = registros[r];
    if (registroVazio(campos)) continue;
    const pegar = (i) => (i >= 0 && i < campos.length ? String(campos[i]).trim() : '');
    const nome = pegar(iNome).replace(/\s+/g, ' ');
    const emailCru = pegar(iEmail);
    const empresa = pegar(iEmpresa).replace(/\s+/g, ' ');
    const email = normalizar(emailCru).replace(/\s+/g, '');

    if (!email) { resultado.rejeitadas.push({ linha: numero, motivo: 'E-mail ausente' }); continue; }
    if (!emailValido(email)) { resultado.rejeitadas.push({ linha: numero, motivo: 'E-mail inválido' }); continue; }
    if (!nome) { resultado.rejeitadas.push({ linha: numero, motivo: 'Nome ausente' }); continue; }
    if (vistos.has(email)) { resultado.rejeitadas.push({ linha: numero, motivo: 'E-mail repetido no arquivo' }); continue; }
    vistos.add(email);
    resultado.linhas.push({ nome: nome.slice(0, 200), email, empresa: empresa.slice(0, 200), numero });
  }
  return resultado;
}

function escaparCampo(valor) {
  let v = valor == null ? '' : String(valor);
  // Evita que o Excel interprete o conteúdo como fórmula.
  if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
  if (/[;"\r\n]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"';
  return v;
}

/** Gera CSV com BOM, separador ';' e quebras \r\n. A primeira linha é o cabeçalho com as colunas. */
export function gerarCsv(linhas, colunas) {
  const cols = Array.isArray(colunas) ? colunas : [];
  const saida = [cols.map(escaparCampo).join(';')];
  for (const linha of Array.isArray(linhas) ? linhas : []) {
    saida.push(cols.map((c) => escaparCampo(linha ? linha[c] : '')).join(';'));
  }
  return '\uFEFF' + saida.join('\r\n') + '\r\n';
}

/** Baixa um texto como arquivo CSV no navegador. */
export function baixarArquivo(nome, conteudo) {
  const nomeSeguro = String(nome || 'arquivo.csv').replace(/[\\/:*?"<>|]+/g, '_');
  const blob = new Blob([String(conteudo == null ? '' : conteudo)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeSeguro;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 1000);
}

/** Baixa o modelo de importação (nome,email,empresa) com uma linha de exemplo. */
export function baixarModelo() {
  const conteudo = '\uFEFFnome,email,empresa\r\nMaria Souza,maria.souza@exemplo.com.br,Empresa Exemplo\r\n';
  baixarArquivo('modelo-inscritos.csv', conteudo);
}
