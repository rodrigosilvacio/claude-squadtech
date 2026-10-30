// Sala 5 · Delivery (Lucas)
//   delivery: lucas_documenta (README, docs, config.js) → lucas_publica (commit no GitHub) → concluido
//   apagando: lucas_remove (tabelas do app, pasta no GitHub e o próprio projeto)
// O commit leva a pasta projetos/<slug>/ inteira e o índice projetos/index.html
// de uma vez (um commit atômico), e o GitHub Pages publica sozinho.
import { atualizar, config, emitir, estado, fala, pedidoDeAjuste, perguntar, type Projeto, supabase } from './nucleo.ts';
import { commitarArquivos } from './github.ts';
import { FORMATO_LUCAS, LUCAS } from './prompts.ts';
import { arquivosGerados, carregarPlano, contextoProjeto, type Ponto, salvarArquivo } from './sala-desenvolvimento.ts';
import type { Problema } from './verificacoes.ts';

interface Resultado { id: string; nome: string; ok: boolean; erro?: string; passo?: number }
interface Qa {
  rodadas: number; pulado: boolean; resultados: Resultado[]; manual: string[];
  julia: (Ponto & { severidade: string })[]; correcoes: Ponto[]; pendencias: Ponto[];
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

async function enderecos(p: Projeto) {
  const cfg = await config();
  return {
    app: `${cfg.url_pages_base}/projetos/${p.slug}/`,
    repo: `https://github.com/${cfg.github_repo}/tree/${cfg.github_branch}/projetos/${p.slug}`,
  };
}

// Última versão de cada arquivo da entrega: código (tipo arquivo) e docs (tipo entrega).
async function arquivosDaEntrega(p: Projeto): Promise<Map<string, string>> {
  const { data, error } = await supabase.from('squad_artefatos').select('tipo, caminho, versao, conteudo')
    .eq('projeto_id', p.id).in('tipo', ['arquivo', 'entrega']).not('caminho', 'is', null).order('versao');
  if (error) throw error;
  return new Map(data.map((a) => [a.caminho as string, a.conteudo as string]));
}

async function salvarDoc(p: Projeto, caminho: string, conteudo: string) {
  const { data } = await supabase.from('squad_artefatos').select('versao').eq('projeto_id', p.id).eq('tipo', 'entrega').eq('caminho', caminho)
    .order('versao', { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase.from('squad_artefatos').insert({ projeto_id: p.id, tipo: 'entrega', caminho, versao: (data?.versao ?? 0) + 1, conteudo, autor: 'lucas' });
  if (error) throw error;
}

const itens = (pontos: Ponto[], vazio: string) => (pontos.length ? pontos.map((x) => `- **${x.arquivo}**: ${x.problema} _Correção:_ ${x.correcao}`).join('\n') : `- ${vazio}`);

function relatorio(nome: string, pontos: Ponto[], finais: Problema[], qa: Qa | null): string {
  const alertas = finais.length ? finais.map((x) => `- **${x.arquivo}**: ${x.problema}`).join('\n') : '- Sem alertas.';
  let testes = '_Sem dados da Sala de Testes._';
  let situacao = 'revisão de integração concluída.';
  if (qa?.pulado) {
    situacao = 'os testes automáticos no navegador foram pulados a pedido do cliente.';
    testes = '- Testes no navegador não executados.';
  } else if (qa) {
    const ok = qa.resultados.filter((t) => t.ok).length;
    situacao = qa.pendencias.length
      ? `entregue com ${qa.pendencias.length} pendências depois de ${qa.rodadas} rodadas de QA (limite atingido).`
      : `${ok} de ${qa.resultados.length} testes automáticos passando no navegador, em ${qa.rodadas} ${qa.rodadas === 1 ? 'rodada' : 'rodadas'} de QA.`;
    testes = `| Teste | Resultado |\n|---|---|\n${qa.resultados.map((t) => `| ${t.id} · ${t.nome} | ${t.ok ? 'passou' : `falhou no passo ${t.passo ?? '?'}: ${(t.erro ?? '').replace(/\|/g, '/')}`} |`).join('\n')}`;
  }
  const melhorias = (qa?.julia ?? []).filter((x) => x.severidade === 'melhoria');
  return `# Relatório de testes · ${nome}

**Situação:** ${situacao}

## Testes automáticos no navegador (Igor)

${testes}

## Pendências

${itens(qa?.pendencias ?? [], 'Nenhuma.')}

## Correções feitas pelo QA

${itens(qa?.correcoes ?? [], 'Nenhuma.')}

## Revisão de código e segurança (Júlia): melhorias sugeridas

${itens(melhorias, 'Nenhuma.')}

## Roteiro de teste manual

${(qa?.manual ?? []).length ? qa!.manual.map((m) => `- [ ] ${m}`).join('\n') : '- Nenhum item.'}

## Revisão de integração (Eduardo)

${itens(pontos, 'Nenhum problema de integração encontrado.')}

## Verificação automática final

Imports, referências do HTML, contratos de export, caminhos relativos e padrões inseguros.

${alertas}
`;
}

// js/config.js do app (URL e chave publishable do Supabase). Criado já na Sala de Testes,
// porque a prévia no navegador precisa dele; só grava de novo se mudar.
export async function garantirConfig(p: Projeto) {
  const { plano } = await carregarPlano(p);
  if (!plano.usa_supabase) return;
  const cfg = await config();
  const conteudo = `// Gerado pelo SquadTech. A chave publishable foi feita para ficar no navegador:\n// o acesso aos dados é controlado pelas políticas de RLS das tabelas ${plano.prefixo}*.\nexport const SUPABASE_URL = '${Deno.env.get('SUPABASE_URL')}';\nexport const SUPABASE_CHAVE = '${cfg.chave_publishable}';\n`;
  const atual = (await arquivosGerados(p)).get('js/config.js');
  if (atual?.conteudo !== conteudo) await salvarArquivo(p, 'js/config.js', conteudo, 'lucas', (atual?.versao ?? 0) + 1);
}

async function lucasDocumenta(p: Projeto) {
  const { doc, prd } = await carregarPlano(p);
  const gerados = await arquivosGerados(p);
  const { app } = await enderecos(p);
  const pontos = (p.rascunho.pontos_integracao as Ponto[]) ?? [];
  const finais = (p.rascunho.verificacao_final as Problema[]) ?? [];
  const qa = (p.rascunho.qa as Qa) ?? null;
  const rel = relatorio(p.nome, pontos, finais, qa);
  const ajuste = await pedidoDeAjuste(p);
  await estado(p, 'lucas', 'digitando');
  const r = await perguntar<{ readme_markdown: string; fala_para_usuario: string }>(p, { contexto: await contextoProjeto(p), persona: LUCAS },
    `Arquivos entregues: ${[...gerados.keys()].join(', ')}\nLink do app: ${app}\n\nRelatório de testes (vai em docs/RELATORIO-TESTES.md):\n${rel}\n\nTarefa: escreva o README.md da entrega, para quem vai usar e testar: o que o app faz (3 linhas), link de acesso, "Como entrar" (se tiver login: use a mesma conta do SquadTech, e-mail e senha do Supabase do Rodrigo; como recuperar a senha pelo próprio app; se outras pessoas precisarem de conta, como criar), como usar passo a passo por perfil de usuário, situação dos testes e roteiro manual, onde os dados ficam e cuidados de LGPD, limitações e pendências conhecidas e o que ficou para depois, e a estrutura da pasta (docs/ tem PRD.md, ARQUITETURA.md e RELATORIO-TESTES.md).${ajuste ? ` Esta é a versão ${p.ciclo} do app (evolução pedida: "${ajuste}"): logo depois do resumo, inclua "O que mudou nesta versão".` : ''} Em "fala_para_usuario", avise em uma frase que a documentação está pronta e a situação dos testes.`,
    FORMATO_LUCAS, 'low', 7000);

  await salvarDoc(p, 'docs/README.md', r.readme_markdown);
  await salvarDoc(p, 'docs/PRD.md', prd);
  await salvarDoc(p, 'docs/ARQUITETURA.md', doc);
  await salvarDoc(p, 'docs/RELATORIO-TESTES.md', rel);
  await garantirConfig(p);
  await emitir(p, 'artefato', 'lucas', null, { dados: { tipo: 'entrega', caminho: 'docs/README.md', titulo: 'README da entrega', autor: 'lucas', conteudo: r.readme_markdown } });
  await fala(p, 'lucas', 'usuario', r.fala_para_usuario);
  await atualizar(p, { subpasso: 'lucas_publica', passo_em: null, tentativas: 0 });
}

// Índice de portfólio com todos os apps já entregues. Na remoção, o projeto sai da lista.
async function portfolio(p: Projeto, app: string, removendo = false): Promise<string> {
  const cfg = await config();
  const { data } = await supabase.from('squad_projetos').select('id, nome, slug, atualizado_em').not('url_app', 'is', null).order('atualizado_em', { ascending: false });
  const outros = (data ?? []).filter((x) => x.id !== p.id);
  const lista = removendo ? outros : [{ id: p.id, nome: p.nome, slug: p.slug, atualizado_em: new Date().toISOString() }, ...outros];
  const itens = lista.map((x) => `      <li>
        <strong>${esc(x.nome)}</strong>
        <span>Entregue em ${new Date(x.atualizado_em).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</span>
        <nav><a href="./${esc(x.slug)}/">Abrir o app</a> · <a href="https://github.com/${cfg.github_repo}/tree/${cfg.github_branch}/projetos/${esc(x.slug)}">Código e documentação</a></nav>
      </li>`).join('\n');
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SquadTech · Projetos entregues</title>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; background: #0f1018; color: #eceaf6; font: 15px/1.6 Inter, system-ui, sans-serif; }
    main { max-width: 760px; margin: 0 auto; padding: 40px 16px; }
    h1 { margin: 0 0 4px; }
    p, span { color: #a6a4bd; }
    a { color: #7cc6fe; }
    ul { list-style: none; padding: 0; display: grid; gap: 10px; }
    li { background: #1d2030; border: 1px solid #2c3045; border-radius: 10px; padding: 12px 14px; display: grid; gap: 2px; }
  </style>
</head>
<body>
  <main>
    <h1>Projetos entregues</h1>
    <p>Aplicações construídas pelo squad do <a href="../">SquadTech</a>. Cada pasta traz o app e a documentação em <code>docs/</code>.</p>
    <!-- Gerado pelo Lucas (Delivery) a cada entrega. Último: ${esc(app)} -->
    <ul id="lista">
${itens || '      <li>Nenhum app publicado no momento.</li>'}
    </ul>
  </main>
</body>
</html>
`;
}

async function lucasPublica(p: Projeto) {
  const token = Deno.env.get('GITHUB_TOKEN_SQUAD');
  if (!token) throw new Error('Falta o token do GitHub: crie o secret GITHUB_TOKEN_SQUAD nas Edge Functions do Supabase e clique em Retomar');
  const cfg = await config();
  const { app, repo } = await enderecos(p);
  const entrega = await arquivosDaEntrega(p);
  const arquivos: Record<string, string> = {};
  for (const [caminho, conteudo] of entrega) arquivos[`projetos/${p.slug}/${caminho}`] = conteudo;
  arquivos['projetos/index.html'] = await portfolio(p, app);

  await estado(p, 'lucas', 'digitando');
  await fala(p, 'lucas', 'usuario', `Publicando ${entrega.size} arquivos em projetos/${p.slug}/ no GitHub.`);
  const sha = await commitarArquivos(token, cfg.github_repo, cfg.github_branch, arquivos, `SquadTech: entrega de ${p.nome} (projetos/${p.slug})`);
  await emitir(p, 'sistema', null, `Commit ${sha.slice(0, 7)} em ${cfg.github_repo}: ${entrega.size} arquivos em projetos/${p.slug}/`, { sala: 'delivery' });
  await atualizar(p, { etapa: 'concluido', subpasso: null, passo_em: null, tentativas: 0, url_app: app, url_repo: repo, rascunho: { commit: sha } });
  const arvore = [`projetos/${p.slug}/`, ...[...entrega.keys()].sort().map((c) => `  ${c}`)].join('\n');
  await emitir(p, 'fim', 'lucas', 'Solução entregue', {
    dados: {
      resumo: `${p.nome} está publicado. O GitHub Pages leva cerca de 1 minuto para atualizar depois do commit.`,
      links: [{ rotulo: 'Abrir o app', url: app }, { rotulo: 'Pasta no GitHub (código e docs)', url: repo }],
      zip: true,
      arquivos: arvore,
    },
  });
}

// Remove o projeto de verdade: tabelas do app, pasta no GitHub (e o índice) e,
// por último, a linha do projeto, que leva junto eventos, artefatos e testes.
async function lucasRemove(p: Projeto) {
  const { data: atual } = await supabase.from('squad_projetos').select('url_app').eq('id', p.id).single();
  if (p.prefixo_db) {
    const { error } = await supabase.rpc('squad_remover_tabelas', { p_prefixo: p.prefixo_db });
    if (error) throw new Error(`Não consegui remover as tabelas do app: ${error.message}`);
  }
  if (atual?.url_app) {
    const token = Deno.env.get('GITHUB_TOKEN_SQUAD');
    if (!token) throw new Error('Falta o token do GitHub para remover a pasta do app (secret GITHUB_TOKEN_SQUAD)');
    const cfg = await config();
    await commitarArquivos(token, cfg.github_repo, cfg.github_branch, { 'projetos/index.html': await portfolio(p, '(removido)', true) },
      `SquadTech: remove ${p.nome} (projetos/${p.slug})`, `projetos/${p.slug}/`);
  }
  const { error } = await supabase.from('squad_projetos').delete().eq('id', p.id);
  if (error) throw error;
}

export const PASSOS_DELIVERY = {
  delivery: { lucas_documenta: lucasDocumenta, lucas_publica: lucasPublica },
  apagando: { lucas_remove: lucasRemove },
};
