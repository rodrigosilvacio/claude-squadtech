// Validação do SQL proposto pela Carla (primeira barreira; a segunda é a função
// squad_executar_migracao no banco). Só passa: create table, alter table,
// create [unique] index, create policy, insert into e comment on, sempre sobre
// public.<prefixo>*, com RLS ligado em toda tabela criada.

const INICIO_PERMITIDO = /^(create\s+table\s+(if\s+not\s+exists\s+)?public\.|alter\s+table\s+(only\s+)?(if\s+exists\s+)?public\.|create\s+(unique\s+)?index\s+(if\s+not\s+exists\s+)?\w+\s+on\s+(only\s+)?public\.|create\s+policy\s+("[^"]+"|\w+)\s+on\s+public\.|insert\s+into\s+public\.|comment\s+on\s+(table|column)\s+public\.)/;
const PROIBIDAS = /\b(drop|truncate|grant|revoke|function|procedure|trigger|execute|copy|definer|extension|schema|owner|rename|disable|vacuum)\b/;
const SCHEMAS_PROIBIDOS = /\b(storage|vault|cron|net|extensions|pg_catalog|information_schema|realtime|supabase_functions|graphql)\s*\./;

// Divide em comandos por ";" fora de aspas, sem comentários.
export function dividirSql(sql: string): string[] {
  const comandos: string[] = [];
  let atual = '';
  let aspas: string | null = null;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    const prox = sql[i + 1];
    if (aspas) {
      atual += c;
      if (c === aspas) {
        if (prox === aspas) { atual += prox; i++; } else aspas = null;
      }
      continue;
    }
    if (c === '-' && prox === '-') { const fim = sql.indexOf('\n', i); i = fim === -1 ? sql.length : fim; atual += ' '; continue; }
    if (c === '/' && prox === '*') { const fim = sql.indexOf('*/', i + 2); i = fim === -1 ? sql.length : fim + 1; atual += ' '; continue; }
    if (c === "'" || c === '"') { aspas = c; atual += c; continue; }
    if (c === ';') { if (atual.trim()) comandos.push(atual.trim()); atual = ''; continue; }
    atual += c;
  }
  if (atual.trim()) comandos.push(atual.trim());
  return comandos;
}

export function validarSql(sql: string, prefixo: string): { comandos: string[]; erros: string[] } {
  const erros: string[] = [];
  if (sql.length > 30_000) erros.push('SQL grande demais (máximo 30 mil caracteres).');
  if (sql.includes('$')) erros.push('Blocos com $ (funções, DO) não são permitidos.');
  const comandos = dividirSql(sql);
  if (comandos.length > 80) erros.push('Mais de 80 comandos.');
  const criadas = new Set<string>();
  const comRls = new Set<string>();

  for (const cmd of comandos) {
    const resumo = cmd.replace(/\s+/g, ' ').slice(0, 90);
    const limpo = cmd.toLowerCase().replace(/'(?:[^']|'')*'/g, "''").replace(/\s+/g, ' ').trim();
    if (!INICIO_PERMITIDO.test(limpo)) { erros.push(`Comando não permitido (use create table/alter table/create index/create policy/insert/comment sempre com "public."): ${resumo}`); continue; }
    const proibida = limpo.match(PROIBIDAS);
    if (proibida) erros.push(`Palavra proibida "${proibida[1]}" em: ${resumo}`);
    if (SCHEMAS_PROIBIDOS.test(limpo)) erros.push(`Schema proibido em: ${resumo}`);
    if (/\b(from|join)\s+auth\s*\./.test(limpo)) erros.push(`Leitura de auth.* não permitida (auth.users só como alvo de FK): ${resumo}`);

    for (const m of limpo.matchAll(/public\s*\.\s*"?([a-z0-9_]+)/g)) {
      if (!m[1].startsWith(prefixo)) erros.push(`Objeto fora do prefixo ${prefixo}: public.${m[1]}`);
    }
    // nomes entre aspas duplas (ex.: nome de política com espaços) não são tabelas
    const semNomes = limpo.replace(/"([^"]*)"/g, (_, s: string) => (/^[a-z0-9_]+$/.test(s) ? s : 'q'));
    for (const m of semNomes.matchAll(/\b(from|join)\s+([a-z0-9_]+)\b(?!\s*\.)/g)) {
      if (!m[2].startsWith(prefixo)) erros.push(`Tabela sem schema ou fora do prefixo em "${m[1]} ${m[2]}": use public.${prefixo}...`);
    }
    for (const m of limpo.matchAll(/\breferences\s+("?[a-z0-9_]+"?)(\s*\.\s*"?[a-z0-9_]+"?)?/g)) {
      const alvo = (m[1] + (m[2] ?? '')).replaceAll('"', '').replace(/\s/g, '');
      if (alvo !== 'auth.users' && !alvo.startsWith(`public.${prefixo}`)) erros.push(`FK só para public.${prefixo}* ou auth.users: references ${alvo}`);
    }
    const idx = limpo.match(/^create (unique )?index (if not exists )?(\w+)/);
    if (idx && !idx[3].startsWith(prefixo)) erros.push(`Índice precisa do prefixo ${prefixo}: ${idx[3]}`);
    const tabela = limpo.match(/^create table (if not exists )?public\.([a-z0-9_]+)/);
    if (tabela) criadas.add(tabela[2]);
    const rls = limpo.match(/^alter table (only )?(if exists )?public\.([a-z0-9_]+) enable row level security/);
    if (rls) comRls.add(rls[3]);
  }
  for (const t of criadas) if (!comRls.has(t)) erros.push(`Falta "alter table public.${t} enable row level security".`);
  return { comandos, erros: [...new Set(erros)] };
}
