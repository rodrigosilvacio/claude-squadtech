// Sala 3 · Desenvolvimento (Eduardo, Fernanda, Gabriel e Helena)
//   planejamento:    eduardo_planeja (contrato de integração + ordem dos arquivos)
//   desenvolvimento: dev_arquivo (um arquivo por invocação, pelo dono da tarefa)
//   integracao:      eduardo_integra → [dev_corrige, um arquivo por invocação] → testes
// Cada arquivo é gerado numa chamada própria para caber no tempo de uma invocação.
// Custo: o contexto do projeto (PRD, arquitetura, regras, contrato) é o mesmo em toda
// chamada e vai em cache; o código dos colegas vai em blocos na ordem de geração,
// então cada arquivo reaproveita do cache o prefixo que o anterior já escreveu.
import { atualizar, config, type Conteudo, emitir, estado, fala, pedidoDeAjuste, perguntar, perguntarTexto, type Projeto, supabase, ultimoArtefato } from './nucleo.ts';
import { devPrompt, EDUARDO, FORMATO_EDUARDO_EVOLUCAO, FORMATO_EDUARDO_PLANO, FORMATO_EDUARDO_REVISAO } from './prompts.ts';
import { type Plano, regras } from './sala-arquitetura.ts';
import { type Problema, verificarArquivos } from './verificacoes.ts';

const NOME: Record<string, string> = { eduardo: 'Eduardo', fernanda: 'Fernanda', gabriel: 'Gabriel', helena: 'Helena' };
const ORCAMENTO_CONTEXTO = 150_000; // caracteres de código já pronto mandados junto com cada arquivo (lidos do cache)

interface Nota { caminho: string; instrucoes: string }
export interface Ponto { arquivo: string; problema: string; correcao: string }

export async function carregarPlano(p: Projeto): Promise<{ plano: Plano; doc: string; prd: string }> {
  const [pl, doc, prd] = await Promise.all([ultimoArtefato(p, 'plano', true), ultimoArtefato(p, 'arquitetura', true), ultimoArtefato(p, 'prd', true)]);
  if (!pl || !doc || !prd) throw new Error('PRD ou arquitetura aprovados não encontrados.');
  return { plano: JSON.parse(pl.conteudo) as Plano, doc: doc.conteudo, prd: prd.conteudo };
}

// Contexto comum a todos os agentes a partir do planejamento. Precisa ser idêntico
// byte a byte entre as chamadas para o cache funcionar: nada de data ou contagem aqui.
export async function contextoProjeto(p: Projeto): Promise<string> {
  const { doc, prd } = await carregarPlano(p);
  const { data } = await supabase.from('squad_artefatos').select('conteudo').eq('projeto_id', p.id)
    .eq('tipo', 'plano').eq('caminho', 'contrato-integracao').order('versao', { ascending: false }).limit(1).maybeSingle();
  const contrato = data?.conteudo ?? (p.rascunho.contrato as string) ?? '(sem contrato)';
  const ajuste = await pedidoDeAjuste(p);
  const evolucao = ajuste ? `\n\n<entrevista>\nEvolução do ciclo ${p.ciclo}, pedida pelo cliente depois da entrega: ${ajuste}\nO app já está em produção: mude só o necessário e preserve o que funciona.\n</entrevista>` : '';
  return `<prd>\n${prd}\n</prd>\n\n<arquitetura>\n${doc}\n</arquitetura>\n\n${await regras(p)}\n\nContrato de integração do Eduardo:\n${contrato}${evolucao}`;
}

// Última versão de cada arquivo de código gerado.
export async function arquivosGerados(p: Projeto): Promise<Map<string, { conteudo: string; versao: number }>> {
  const { data, error } = await supabase.from('squad_artefatos').select('caminho, versao, conteudo')
    .eq('projeto_id', p.id).eq('tipo', 'arquivo').order('versao');
  if (error) throw error;
  const mapa = new Map<string, { conteudo: string; versao: number }>();
  for (const a of data) mapa.set(a.caminho, { conteudo: a.conteudo, versao: a.versao });
  return mapa;
}

export const conteudos = (m: Map<string, { conteudo: string }>) => new Map([...m].map(([k, v]) => [k, v.conteudo]));
export const donoDo = (plano: Plano, caminho: string) => plano.tarefas.find((t) => t.arquivos.includes(caminho))?.agente ?? 'eduardo';

// Código já pronto, um bloco por arquivo na ordem de geração, inteiro enquanto couber
// no orçamento (depois, só as linhas de export). O último bloco marca o cache.
export function codigoPronto(gerados: Map<string, { conteudo: string }>, ordem: string[], exceto: string): { texto: string; cache?: boolean }[] {
  let usado = 0;
  const blocos: { texto: string; cache?: boolean }[] = [];
  for (const caminho of ordem) {
    const g = gerados.get(caminho);
    if (!g || caminho === exceto) continue;
    let corpo = g.conteudo;
    if (usado + corpo.length > ORCAMENTO_CONTEXTO) {
      corpo = corpo.split('\n').filter((l) => /^\s*export\b|\bid=|<script|<link/.test(l)).join('\n') + '\n/* (conteúdo resumido: só exports e referências) */';
    }
    usado += corpo.length;
    blocos.push({ texto: `--- ${caminho} ---\n${corpo}\n` });
  }
  if (!blocos.length) return [{ texto: 'Código já pronto dos colegas: (nenhum arquivo pronto ainda)\n' }];
  blocos.unshift({ texto: 'Código já pronto dos colegas:\n' });
  blocos[blocos.length - 1].cache = true;
  return blocos;
}

export async function salvarArquivo(p: Projeto, caminho: string, conteudo: string, autor: string, versao: number) {
  const { error } = await supabase.from('squad_artefatos').insert({ projeto_id: p.id, tipo: 'arquivo', caminho, versao, conteudo, autor });
  if (error) throw error;
  await emitir(p, 'artefato', autor, null, { dados: { tipo: 'arquivo', caminho, titulo: caminho, autor, formato: 'codigo', conteudo, versao } });
}

const semCercas = (s: string) => s.replace(/^\s*```[a-z]*\n/i, '').replace(/\n```\s*$/, '');
const TAMANHO_ENXUTO = 15000;

// Um dev escreve um arquivo. Devolve null se a resposta passou do limite de tokens.
export async function escreverArquivo(p: Projeto, agente: string, pedido: Conteudo): Promise<{ conteudo: string; fala: string } | null> {
  const r = await perguntarTexto(p, { contexto: await contextoProjeto(p), persona: devPrompt(agente) }, pedido, 'low', 16000);
  if (r.cortada) return null;
  const ini = r.texto.indexOf('<arquivo>');
  const fim = r.texto.lastIndexOf('</arquivo>');
  if (ini < 0 || fim < ini) throw new Error(`${NOME[agente] ?? 'O dev'} não devolveu o arquivo no formato combinado.`);
  return {
    conteudo: semCercas(r.texto.slice(ini + '<arquivo>'.length, fim).replace(/^\n/, '')),
    fala: r.texto.match(/FALA:\s*(.+)/)?.[1]?.trim() ?? 'Arquivo entregue.',
  };
}

// Arquivo grande demais: na primeira vez o Eduardo pede uma versão enxuta; na segunda, para.
export async function pedirVersaoEnxuta(p: Projeto, agente: string, caminho: string, subpasso: string) {
  const enxutos = (p.rascunho.enxutos as string[]) ?? [];
  if (enxutos.includes(caminho)) throw new Error(`O arquivo ${caminho} passou do tamanho mesmo na versão enxuta. Vale dividi-lo em dois na arquitetura`);
  await fala(p, 'eduardo', agente, `${NOME[agente]}, o ${caminho} ficou grande demais. Reescreve mais enxuto, até ${TAMANHO_ENXUTO} caracteres.`);
  await atualizar(p, { subpasso, passo_em: null, tentativas: 0, rascunho: { ...p.rascunho, enxutos: [...enxutos, caminho] } });
}

export const avisoEnxuto = (p: Projeto, caminho: string) => (((p.rascunho.enxutos as string[]) ?? []).includes(caminho)
  ? `\nATENÇÃO: sua versão anterior passou do tamanho. Escreva uma versão enxuta, com até ${TAMANHO_ENXUTO} caracteres: reaproveite funções, corte comentários e repetição, mantendo os exports e ids do contrato.`
  : '');

// ---------- planejamento ----------

// Ciclo de evolução: o Eduardo lê o código em produção e decide o que muda.
async function eduardoPlanejaEvolucao(p: Projeto) {
  const { plano, doc, prd } = await carregarPlano(p);
  const gerados = await arquivosGerados(p);
  const ajuste = await pedidoDeAjuste(p);
  const caminhos = plano.arquivos.map((a) => a.caminho);
  const anterior = (await supabase.from('squad_artefatos').select('conteudo').eq('projeto_id', p.id).eq('tipo', 'plano')
    .eq('caminho', 'contrato-integracao').maybeSingle()).data?.conteudo ?? '(sem contrato)';
  await estado(p, 'eduardo', 'lendo');
  const r = await perguntar<{ fala_para_time: string; contrato_markdown: string; ordem: string[]; alterar: string[]; notas: Nota[] }>(p, EDUARDO, [
    { texto: `<prd>\n${prd}\n</prd>\n\n<arquitetura>\n${doc}\n</arquitetura>\n\n${await regras(p)}\n\nContrato de integração atual:\n${anterior}\n\n` },
    ...codigoPronto(gerados, caminhos, ''),
    { texto: `Evolução pedida pelo cliente (ciclo ${p.ciclo}): ${ajuste ?? '-'}\n\nTarefa: este app já está em produção com o código acima. Prepare o time para a evolução.\n1. "contrato_markdown": o contrato de integração completo e atualizado (o que não muda continua igual).\n2. "ordem": TODOS os arquivos do plano, das dependências para quem depende delas.\n3. "alterar": só os arquivos que precisam ser criados ou reescritos para a evolução. Arquivo que não muda fica de fora.\n4. "notas": para cada arquivo de "alterar", exatamente o que muda.\n5. "fala_para_time": abra a reunião em uma frase.` },
  ], FORMATO_EDUARDO_EVOLUCAO, 'low', 12000);
  const ordem = [...new Set([...r.ordem.filter((c) => caminhos.includes(c)), ...caminhos])];
  // Arquivo novo na arquitetura entra sempre; os demais só se o Eduardo pediu.
  const alterar = ordem.filter((c) => r.alterar.includes(c) || !gerados.has(c));
  if (!alterar.length) throw new Error('O Eduardo não encontrou nenhum arquivo para mudar nesta evolução.');

  const { error } = await supabase.from('squad_tarefas').upsert(
    plano.tarefas.map((t, i) => ({ projeto_id: p.id, rodada: p.ciclo, n: i + 1, titulo: t.titulo, descricao: t.descricao, agente: t.agente, arquivos: t.arquivos, status: t.arquivos.some((a) => alterar.includes(a)) ? 'pendente' : 'concluida' })),
    { onConflict: 'projeto_id,rodada,n' },
  );
  if (error) throw error;
  await supabase.from('squad_artefatos').delete().eq('projeto_id', p.id).eq('tipo', 'plano').eq('caminho', 'contrato-integracao');
  await supabase.from('squad_artefatos').insert({ projeto_id: p.id, tipo: 'plano', caminho: 'contrato-integracao', versao: 1, conteudo: r.contrato_markdown, autor: 'eduardo' });
  await emitir(p, 'artefato', 'eduardo', null, { dados: { tipo: 'plano', caminho: 'contrato-integracao', titulo: `Contrato de integração (ciclo ${p.ciclo})`, autor: 'eduardo', conteudo: r.contrato_markdown } });

  const devs = [...new Set(['eduardo', ...alterar.map((c) => donoDo(plano, c))])];
  await emitir(p, 'reunir', 'eduardo', null, { dados: { agentes: devs } });
  await fala(p, 'eduardo', devs.find((d) => d !== 'eduardo') ?? 'fernanda', r.fala_para_time);
  await fala(p, 'eduardo', devs.find((d) => d !== 'eduardo') ?? 'fernanda', `Nesta evolução mudam ${alterar.length} de ${ordem.length} arquivos: ${alterar.join(', ')}.`);
  await atualizar(p, {
    etapa: 'desenvolvimento', subpasso: 'dev_arquivo', passo_em: null, tentativas: 0,
    rascunho: { contrato: r.contrato_markdown, notas: r.notas, ordem, alterar, feitos: [] },
  });
}

async function eduardoPlaneja(p: Projeto) {
  if (p.ciclo > 1) return eduardoPlanejaEvolucao(p);
  const { plano, doc, prd } = await carregarPlano(p);
  await estado(p, 'eduardo', 'lendo');
  const r = await perguntar<{ fala_para_time: string; contrato_markdown: string; ordem: string[]; notas: Nota[] }>(p, EDUARDO,
    `<prd>\n${prd}\n</prd>\n\n<arquitetura>\n${doc}\n</arquitetura>\n\n${await regras(p)}\n\nTarefa: prepare o time antes de qualquer código.\n1. "contrato_markdown": o contrato de integração que todos vão seguir: ids e classes do HTML que o JavaScript usa (tabela id → arquivo que usa), formato dos objetos trocados entre módulos (campos e tipos), como as telas são mostradas e escondidas, eventos entre módulos, mensagens de erro padrão e ordem de carregamento dos scripts. Seja concreto.\n2. "ordem": todos os caminhos de arquivo do plano, das dependências para quem depende delas (ex.: CSS e módulos de dados antes do módulo que integra; index.html por último).\n3. "notas": instruções específicas para cada arquivo, se houver.\n4. "fala_para_time": abra a reunião com o time em uma frase.`,
    FORMATO_EDUARDO_PLANO, 'low', 9000);
  const caminhos = plano.arquivos.map((a) => a.caminho);
  const ordem = [...new Set([...r.ordem.filter((c) => caminhos.includes(c)), ...caminhos])];

  const { error } = await supabase.from('squad_tarefas').upsert(
    plano.tarefas.map((t, i) => ({ projeto_id: p.id, rodada: p.ciclo, n: i + 1, titulo: t.titulo, descricao: t.descricao, agente: t.agente, arquivos: t.arquivos, status: 'pendente' })),
    { onConflict: 'projeto_id,rodada,n' },
  );
  if (error) throw error;
  await supabase.from('squad_artefatos').delete().eq('projeto_id', p.id).eq('tipo', 'plano').eq('caminho', 'contrato-integracao');
  await supabase.from('squad_artefatos').insert({ projeto_id: p.id, tipo: 'plano', caminho: 'contrato-integracao', versao: 1, conteudo: r.contrato_markdown, autor: 'eduardo' });
  await emitir(p, 'artefato', 'eduardo', null, { dados: { tipo: 'plano', caminho: 'contrato-integracao', titulo: 'Contrato de integração', autor: 'eduardo', conteudo: r.contrato_markdown } });

  const devs = [...new Set(['eduardo', ...plano.tarefas.map((t) => t.agente)])];
  await emitir(p, 'reunir', 'eduardo', null, { dados: { agentes: devs } });
  await fala(p, 'eduardo', devs.find((d) => d !== 'eduardo') ?? 'fernanda', r.fala_para_time);
  for (const t of plano.tarefas) {
    if (t.agente === 'eduardo') continue;
    await fala(p, t.agente, 'eduardo', `Fico com ${t.titulo.toLowerCase()}: ${t.arquivos.join(', ')}.`);
  }
  await atualizar(p, {
    etapa: 'desenvolvimento', subpasso: 'dev_arquivo', passo_em: null, tentativas: 0,
    rascunho: { contrato: r.contrato_markdown, notas: r.notas, ordem, feitos: [] },
  });
}

// ---------- desenvolvimento ----------

// Pedido de um arquivo: código dos colegas (prefixo em cache) e, depois, o que é só deste arquivo.
export async function pedidoArquivo(p: Projeto, caminho: string, extra: string, gerados: Map<string, { conteudo: string }>): Promise<Conteudo> {
  const { plano } = await carregarPlano(p);
  const ordem = (p.rascunho.ordem as string[]) ?? plano.arquivos.map((a) => a.caminho);
  const notas = ((p.rascunho.notas as Nota[]) ?? []).filter((n) => n.caminho === caminho).map((n) => n.instrucoes).join('\n');
  const arquivo = plano.arquivos.find((a) => a.caminho === caminho);
  return [
    ...codigoPronto(gerados, ordem, caminho),
    { texto: `Seu arquivo: ${caminho}\nResponsabilidade: ${arquivo?.responsabilidade ?? '-'}\nExporta: ${arquivo?.exporta.join('; ') || '-'}\n${notas ? `Notas do Eduardo: ${notas}\n` : ''}${extra}` },
  ];
}

async function devArquivo(p: Projeto) {
  const { plano } = await carregarPlano(p);
  const cfg = await config();
  // Na evolução só os arquivos de "alterar" são escritos; a ordem completa fica para a integração.
  const ordem = (p.rascunho.alterar as string[]) ?? (p.rascunho.ordem as string[]);
  const feitos = (p.rascunho.feitos as string[]) ?? [];
  const caminho = ordem.find((c) => !feitos.includes(c));
  if (!caminho) {
    await irParaIntegracao(p);
    return;
  }
  const agente = donoDo(plano, caminho);
  const gerados = await arquivosGerados(p);
  const atual = gerados.get(caminho);
  const tarefa = atual
    ? `\nVersão em produção do seu arquivo:\n--- ${caminho} ---\n${atual.conteudo}\n\nTarefa: devolva o arquivo ${caminho} completo e atualizado para a evolução (até ${cfg.max_caracteres_arquivo} caracteres), mudando só o necessário e preservando o que já funciona.`
    : `\nTarefa: escreva o arquivo ${caminho} completo (até ${cfg.max_caracteres_arquivo} caracteres).`;
  await estado(p, agente, 'digitando');
  const r = await escreverArquivo(p, agente, await pedidoArquivo(p, caminho, `${tarefa}${avisoEnxuto(p, caminho)}`, gerados));
  if (!r) {
    await pedirVersaoEnxuta(p, agente, caminho, 'dev_arquivo');
    return;
  }
  await salvarArquivo(p, caminho, r.conteudo, agente, (gerados.get(caminho)?.versao ?? 0) + 1);
  await fala(p, agente, 'eduardo', r.fala);

  const novosFeitos = [...feitos, caminho];
  for (const [i, t] of plano.tarefas.entries()) {
    if (!t.arquivos.includes(caminho)) continue;
    const status = t.arquivos.every((a) => novosFeitos.includes(a)) ? 'concluida' : 'em_andamento';
    await supabase.from('squad_tarefas').update({ status }).eq('projeto_id', p.id).eq('rodada', p.ciclo).eq('n', i + 1);
  }
  if (novosFeitos.length >= ordem.length) {
    await fala(p, 'eduardo', 'fernanda', `Os ${ordem.length} arquivos estão prontos. Vou revisar a integração antes de entregar.`);
    await irParaIntegracao(p);
    return;
  }
  await atualizar(p, { subpasso: 'dev_arquivo', passo_em: null, tentativas: 0, rascunho: { ...p.rascunho, feitos: novosFeitos } });
}

async function irParaIntegracao(p: Projeto) {
  await atualizar(p, { etapa: 'integracao', subpasso: 'eduardo_integra', passo_em: null, tentativas: 0, rascunho: { contrato: p.rascunho.contrato, notas: p.rascunho.notas, ordem: p.rascunho.ordem } });
}

// ---------- integração ----------

async function eduardoIntegra(p: Projeto) {
  const { plano } = await carregarPlano(p);
  const cfg = await config();
  const gerados = await arquivosGerados(p);
  const automaticos = verificarArquivos(conteudos(gerados), plano, Number(cfg.max_caracteres_arquivo));
  await estado(p, 'eduardo', 'lendo');
  const ordem = p.rascunho.ordem as string[];
  const r = await perguntar<{ fala_para_time: string; pontos: Ponto[] }>(p, { contexto: await contextoProjeto(p), persona: EDUARDO }, [
    ...codigoPronto(gerados, ordem, ''),
    { texto: `Verificação automática:\n${automaticos.length ? automaticos.map((x) => `- ${x.arquivo}: ${x.problema}`).join('\n') : '- nenhum problema'}\n\nTarefa: revise a integração como Tech Lead. Procure o que quebra o app de verdade: imports e exports que não batem, ids do HTML que o JS procura e não existem, funções chamadas com assinatura diferente, telas que nunca aparecem, erros que travam o fluxo principal, XSS (innerHTML com dado do usuário), consultas ao Supabase que a RLS vai bloquear. Ignore estilo e preferências. Para cada problema: arquivo, problema e correção. Em "fala_para_time", dê o parecer.` },
  ], FORMATO_EDUARDO_REVISAO, 'medium', 10000);

  const caminhos = new Set(plano.arquivos.map((a) => a.caminho));
  const pontos: Ponto[] = [
    ...automaticos.filter((x) => caminhos.has(x.arquivo)).map((x) => ({ arquivo: x.arquivo, problema: x.problema, correcao: 'Corrigir conforme a verificação automática.' })),
    ...r.pontos.filter((x) => caminhos.has(x.arquivo)),
  ];
  await fala(p, 'eduardo', 'fernanda', r.fala_para_time);
  const fila = ordem.filter((c) => pontos.some((x) => x.arquivo === c));
  await supabase.from('squad_artefatos').delete().eq('projeto_id', p.id).eq('tipo', 'revisao_codigo').eq('versao', 1);
  await supabase.from('squad_artefatos').insert({
    projeto_id: p.id, tipo: 'revisao_codigo', versao: 1, autor: 'eduardo',
    conteudo: pontos.length ? pontos.map((x) => `- **${x.arquivo}**: ${x.problema} Correção: ${x.correcao}`).join('\n') : 'Nenhum problema de integração encontrado.',
  });
  if (!fila.length) {
    await irParaTestes(p, []);
    return;
  }
  const primeiro = donoDo(plano, fila[0]);
  if (primeiro !== 'eduardo') await fala(p, 'eduardo', primeiro, `${NOME[primeiro]}, começa por ${fila[0]}: ${pontos.find((x) => x.arquivo === fila[0])!.problema.slice(0, 140)}`);
  await atualizar(p, { subpasso: 'dev_corrige', passo_em: null, tentativas: 0, rascunho: { ...p.rascunho, pontos, fila, corrigidos: [] } });
}

async function devCorrige(p: Projeto) {
  const { plano } = await carregarPlano(p);
  const cfg = await config();
  const fila = p.rascunho.fila as string[];
  const corrigidos = (p.rascunho.corrigidos as string[]) ?? [];
  const pontos = p.rascunho.pontos as Ponto[];
  const caminho = fila.find((c) => !corrigidos.includes(c));
  if (!caminho) {
    await irParaTestes(p, pontos);
    return;
  }
  const agente = donoDo(plano, caminho);
  const gerados = await arquivosGerados(p);
  const atual = gerados.get(caminho);
  const meus = pontos.filter((x) => x.arquivo === caminho).map((x, i) => `${i + 1}. ${x.problema} Correção: ${x.correcao}`).join('\n');
  await estado(p, agente, 'digitando');
  const r = await escreverArquivo(p, agente,
    await pedidoArquivo(p, caminho, `\nVersão atual do seu arquivo:\n--- ${caminho} ---\n${atual?.conteudo ?? '(não gerado)'}\n\nO Eduardo apontou na integração:\n${meus}\n\nTarefa: devolva o arquivo ${caminho} completo e corrigido (até ${cfg.max_caracteres_arquivo} caracteres), mudando só o necessário.${avisoEnxuto(p, caminho)}`, gerados));
  if (!r) {
    await pedirVersaoEnxuta(p, agente, caminho, 'dev_corrige');
    return;
  }
  await salvarArquivo(p, caminho, r.conteudo, agente, (atual?.versao ?? 0) + 1);
  await fala(p, agente, 'eduardo', r.fala);
  const novos = [...corrigidos, caminho];
  if (novos.length >= fila.length) {
    await irParaTestes(p, pontos);
    return;
  }
  await atualizar(p, { subpasso: 'dev_corrige', passo_em: null, tentativas: 0, rascunho: { ...p.rascunho, corrigidos: novos } });
}

// Fecha o desenvolvimento: verificação final e entrega para a Sala de Testes.
async function irParaTestes(p: Projeto, pontos: Ponto[]) {
  const { plano } = await carregarPlano(p);
  const cfg = await config();
  const finais: Problema[] = verificarArquivos(conteudos(await arquivosGerados(p)), plano, Number(cfg.max_caracteres_arquivo));
  await supabase.from('squad_tarefas').update({ status: 'concluida' }).eq('projeto_id', p.id).eq('rodada', p.ciclo);
  await fala(p, 'eduardo', 'fernanda', finais.length
    ? `Integração revisada. ${finais.length === 1 ? 'Ficou 1 alerta automático, que vai' : `Ficaram ${finais.length} alertas automáticos, que vão`} para o QA.`
    : `Integração revisada${pontos.length ? ` e ${pontos.length} ajustes aplicados` : ''}. Verificação automática limpa.`);
  await emitir(p, 'handoff', 'eduardo', 'Júlia e Igor, o código está integrado. É com vocês.', { para: 'julia', dados: { artefato: 'o código' } });
  await emitir(p, 'fase', null, 'Sala 4 · Testes revisa e testa o app', { sala: 'testes' });
  await atualizar(p, {
    etapa: 'testes', subpasso: 'julia_revisa', passo_em: null, tentativas: 0, rodada_qa: 1,
    rascunho: { ordem: p.rascunho.ordem, notas: p.rascunho.notas, pontos_integracao: pontos, verificacao_final: finais },
  });
}

export const PASSOS_DESENVOLVIMENTO = {
  planejamento: { eduardo_planeja: eduardoPlaneja },
  desenvolvimento: { dev_arquivo: devArquivo },
  integracao: { eduardo_integra: eduardoIntegra, dev_corrige: devCorrige },
};
