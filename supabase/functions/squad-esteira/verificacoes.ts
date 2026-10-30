// Verificações determinísticas do código gerado pelos devs. Pegam o que mais
// quebra um app montado por várias pessoas: import para arquivo que não existe,
// HTML apontando para caminho errado, export prometido no contrato que não
// foi escrito e padrões inseguros.

export interface Problema { arquivo: string; problema: string }
interface ArquivoPlano { caminho: string; exporta: string[] }

// Resolve "./x.js" ou "../css/a.css" a partir do arquivo que referencia.
export function resolver(de: string, rel: string): string | null {
  const partes = de.split('/').slice(0, -1);
  for (const p of rel.split('/')) {
    if (p === '.' || p === '') continue;
    if (p === '..') { if (!partes.length) return null; partes.pop(); } else partes.push(p);
  }
  return partes.join('/');
}

const EXTERNO = /^(https?:|mailto:|tel:|data:|blob:|#)/i;
// "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.5/+esm" tem versão; ".../supabase-js/+esm" não.
function cdnSemVersao(url: string): boolean {
  const m = url.match(/(?:cdn\.jsdelivr\.net\/npm\/|esm\.sh\/|unpkg\.com\/)(.+)$/i);
  if (!m) return false;
  const partes = m[1].split('/');
  const pacote = m[1].startsWith('@') ? partes.slice(0, 2).join('/') : partes[0];
  return !/@\d/.test(pacote.replace(/^@/, ''));
}

export function verificarArquivos(arquivos: Map<string, string>, plano: { arquivos: ArquivoPlano[]; usa_supabase: boolean }, maxChars: number): Problema[] {
  const problemas: Problema[] = [];
  const existe = (c: string) => arquivos.has(c) || (c === 'js/config.js' && plano.usa_supabase);

  for (const a of plano.arquivos) {
    const conteudo = arquivos.get(a.caminho);
    if (!conteudo?.trim()) { problemas.push({ arquivo: a.caminho, problema: 'Arquivo não foi gerado ou está vazio.' }); continue; }
    if (conteudo.length > maxChars) problemas.push({ arquivo: a.caminho, problema: `Arquivo com ${conteudo.length} caracteres (máximo ${maxChars}).` });
  }

  for (const [caminho, conteudo] of arquivos) {
    if (/service_role|sb_secret_/i.test(conteudo)) problemas.push({ arquivo: caminho, problema: 'Menciona service_role ou chave secreta: o navegador só pode ter a chave publishable.' });
    if (/\beval\s*\(|new\s+Function\s*\(/.test(conteudo)) problemas.push({ arquivo: caminho, problema: 'Usa eval ou new Function.' });

    if (caminho.endsWith('.html')) {
      for (const m of conteudo.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
        const ref = m[1].trim();
        if (/^javascript:/i.test(ref)) { problemas.push({ arquivo: caminho, problema: `Link com javascript: (${ref.slice(0, 40)}).` }); continue; }
        if (EXTERNO.test(ref)) continue;
        if (ref.startsWith('/')) { problemas.push({ arquivo: caminho, problema: `Caminho absoluto "${ref}": no GitHub Pages use caminho relativo.` }); continue; }
        const alvo = resolver(caminho, ref.split(/[?#]/)[0]);
        if (!alvo || !existe(alvo)) problemas.push({ arquivo: caminho, problema: `Referência para "${ref}", que não existe na pasta do projeto.` });
      }
    }

    if (caminho.endsWith('.js') || caminho.endsWith('.html')) {
      const imports = [
        ...conteudo.matchAll(/\bimport\s+(?:[^'";]*?\sfrom\s+)?["']([^"']+)["']/g),
        ...conteudo.matchAll(/\bexport\s+[^'";]*?\sfrom\s+["']([^"']+)["']/g),
        ...conteudo.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g),
      ].map((m) => m[1]);
      for (const ref of imports) {
        if (/^https?:/i.test(ref)) {
          if (cdnSemVersao(ref)) problemas.push({ arquivo: caminho, problema: `Import de CDN sem versão fixa: ${ref}` });
          continue;
        }
        if (!ref.startsWith('.')) { problemas.push({ arquivo: caminho, problema: `Import "${ref}" sem caminho relativo (no navegador, só "./" ou "../" ou URL completa).` }); continue; }
        const alvo = resolver(caminho, ref);
        if (alvo === 'js/config.js' && !plano.usa_supabase) { problemas.push({ arquivo: caminho, problema: 'Importa config.js, mas o app não usa Supabase.' }); continue; }
        if (!alvo || !existe(alvo)) problemas.push({ arquivo: caminho, problema: `Import de "${ref}", que não existe na pasta do projeto.` });
      }
    }
  }

  // Contratos: cada export prometido na arquitetura precisa existir no arquivo.
  for (const a of plano.arquivos) {
    const conteudo = arquivos.get(a.caminho);
    if (!conteudo || !a.caminho.endsWith('.js')) continue;
    for (const assinatura of a.exporta) {
      const nome = assinatura.match(/^\s*(?:export\s+)?(?:async\s+)?(?:function\s+|const\s+|class\s+)?([A-Za-z_$][\w$]*)/)?.[1];
      if (!nome || nome === 'default') continue;
      const declarado = new RegExp(`export\\s+(?:default\\s+)?(?:async\\s+)?(?:function\\*?|const|let|var|class)\\s+${nome}\\b`).test(conteudo)
        || new RegExp(`export\\s*\\{[^}]*\\b${nome}\\b[^}]*\\}`).test(conteudo);
      if (!declarado) problemas.push({ arquivo: a.caminho, problema: `Não exporta "${nome}", prometido no contrato da arquitetura.` });
    }
  }
  return problemas;
}
