// Sala 2 · Arquitetura (Carla e Diego)
//   arquitetura: carla_propoe → [carla_sql] → diego_revisa → [carla_ajusta → [carla_sql]] → aguardando_aprovacao_arquitetura
//   migracao:    diego_aplica → planejamento (Sala 3)
// A Carla trabalha em dois passos (desenho, depois SQL) para cada um caber no
// tempo de uma invocação.
// O que o cliente aprova no Portão 2 é exatamente o que roda: o documento é
// montado a partir dos mesmos dados (arquivos, SQL, tarefas) guardados no plano.
import { atualizar, config, emitir, estado, fala, listar, perguntar, type Projeto, supabase, ultimoArtefato } from './nucleo.ts';
import { CARLA, DIEGO, FORMATO_CARLA, FORMATO_CARLA_SQL, FORMATO_DIEGO, REGRAS_TECNICAS } from './prompts.ts';
import { validarSql } from './sql.ts';

const AGENTES_DEV = ['eduardo', 'fernanda', 'gabriel', 'helena'];
const NOME_DEV: Record<string, string> = { eduardo: 'Eduardo', fernanda: 'Fernanda', gabriel: 'Gabriel', helena: 'Helena' };
const MAX_AJUSTES = 2;
const CAMINHO_VALIDO = /^(?!docs\/)[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9_-]*)*\.(html|css|js|json|svg)$/;

interface Arquivo { caminho: string; responsabilidade: string; exporta: string[] }
interface Tarefa { titulo: string; descricao: string; agente: string; arquivos: string[] }
interface Desenho { fala_para_diego: string; visao_geral_markdown: string; modelo_dados: string; arquivos: Arquivo[]; usa_supabase: boolean; tarefas: Tarefa[] }
interface Proposta extends Desenho { sql: string }
interface Ponto { trecho: string; problema: string; sugestao: string }
interface Revisao { aprovado: boolean; pontos: Ponto[]; fala_para_carla: string }
export interface Plano { prefixo: string; usa_supabase: boolean; sql: string; arquivos: Arquivo[]; tarefas: Tarefa[] }

// sq_<slug curto>_<4 hex do id>_ : legível e único por projeto (cabe nos 63 caracteres do Postgres).
export function prefixoDo(p: Projeto): string {
  return p.prefixo_db ?? `sq_${p.slug.replace(/-/g, '_').slice(0, 14).replace(/_+$/, '')}_${p.id.slice(0, 4)}_`;
}

async function regras(p: Projeto): Promise<string> {
  const cfg = await config();
  return REGRAS_TECNICAS.replaceAll('{prefixo}', prefixoDo(p))
    .replaceAll('{max_arquivos}', cfg.max_arquivos).replaceAll('{max_chars}', cfg.max_caracteres_arquivo);
}

// PRD aprovado + ajustes que o cliente pediu nas versões anteriores da arquitetura.
async function contexto(p: Projeto): Promise<string> {
  const prd = await ultimoArtefato(p, 'prd', true);
  if (!prd) throw new Error('Nenhum PRD aprovado encontrado.');
  const { data, error } = await supabase.from('squad_artefatos').select('versao, comentario')
    .eq('projeto_id', p.id).eq('tipo', 'arquitetura').not('comentario', 'is', null).order('versao');
  if (error) throw error;
  const ajustes = data.map((a) => `- Sobre a arquitetura v${a.versao}: ${a.comentario}`).join('\n');
  return `<prd>\n${prd.conteudo}\n</prd>${ajustes ? `\n\n<entrevista>\nAjustes que o cliente pediu na arquitetura. São as decisões mais recentes e prevalecem:\n${ajustes}\n</entrevista>` : ''}`;
}

// ---------- validação determinística do plano ----------

export async function validarPlano(r: Proposta, prefixo: string): Promise<string[]> {
  const cfg = await config();
  const erros: string[] = [];
  const caminhos = r.arquivos.map((a) => a.caminho);
  if (!caminhos.length) erros.push('Nenhum arquivo no plano.');
  if (caminhos.length > Number(cfg.max_arquivos)) erros.push(`${caminhos.length} arquivos (máximo ${cfg.max_arquivos}).`);
  if (!caminhos.includes('index.html')) erros.push('Falta o index.html na raiz.');
  for (const c of caminhos) {
    if (!CAMINHO_VALIDO.test(c)) erros.push(`Caminho inválido: "${c}" (minúsculas, relativo, .html/.css/.js/.json/.svg, fora de docs/).`);
    if (c === 'js/config.js') erros.push('js/config.js é gerado pelo squad: tire da lista de arquivos.');
  }
  if (new Set(caminhos).size !== caminhos.length) erros.push('Há caminhos de arquivo repetidos.');

  if (r.tarefas.length < 1 || r.tarefas.length > 6) erros.push(`${r.tarefas.length} tarefas (de 1 a 6).`);
  const dono = new Map<string, number>();
  r.tarefas.forEach((t, i) => {
    if (!AGENTES_DEV.includes(t.agente)) erros.push(`Tarefa ${i + 1}: agente inválido "${t.agente}".`);
    if (!t.arquivos.length || t.arquivos.length > 4) erros.push(`Tarefa ${i + 1}: precisa de 1 a 4 arquivos.`);
    for (const a of t.arquivos) {
      if (!caminhos.includes(a)) erros.push(`Tarefa ${i + 1} cita "${a}", que não está na lista de arquivos.`);
      dono.set(a, (dono.get(a) ?? 0) + 1);
    }
  });
  for (const c of caminhos) {
    const n = dono.get(c) ?? 0;
    if (n === 0) erros.push(`O arquivo "${c}" não está em nenhuma tarefa.`);
    if (n > 1) erros.push(`O arquivo "${c}" está em ${n} tarefas (precisa estar em uma só).`);
  }

  if (r.sql.trim()) {
    if (!r.usa_supabase) erros.push('Há SQL, mas "usa_supabase" está falso.');
    erros.push(...validarSql(r.sql, prefixo).erros);
  }
  return erros;
}

// ---------- documento do Portão 2 ----------

const celula = (s: string) => s.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim();

export function montarDocumento(p: Projeto, r: Proposta, versao: number, prefixo: string): string {
  const arquivos = r.arquivos.map((a) => `| \`${a.caminho}\` | ${celula(a.responsabilidade)} | ${a.exporta.length ? a.exporta.map((e) => `\`${celula(e)}\``).join('<br>') : '-'} |`).join('\n');
  const tarefas = r.tarefas.map((t, i) => `| ${i + 1} | **${celula(t.titulo)}**<br>${celula(t.descricao)} | ${NOME_DEV[t.agente] ?? t.agente} | ${t.arquivos.map((a) => `\`${a}\``).join('<br>')} |`).join('\n');
  const dados = r.sql.trim()
    ? `Prefixo das tabelas: \`${prefixo}\`\n\n\`\`\`sql\n${r.sql.trim()}\n\`\`\`\n\nEste SQL só é aplicado depois da sua aprovação, pelo executor seguro: só tabelas com o prefixo do projeto, RLS obrigatório, sem funções, sem DROP e sem GRANT.`
    : r.usa_supabase
      ? 'Usa o Supabase só para login, sem tabelas novas.'
      : 'Sem banco de dados: o app guarda o que precisa no próprio navegador.';
  const modelo = r.modelo_dados?.trim() ? `${r.modelo_dados.trim()}\n\n` : '';
  return `# Arquitetura · ${p.nome}\n\n**Versão:** ${versao} · **Proposta:** Carla · **Revisão:** Diego\n\n${r.visao_geral_markdown.trim()}\n\n## Arquivos\n\n| Arquivo | Responsabilidade | Exporta |\n|---|---|---|\n${arquivos}\n\n## Modelo de dados\n\n${modelo}${dados}\n\n## Plano de tarefas\n\n| # | Tarefa | Dev | Arquivos |\n|---|---|---|---|\n${tarefas}\n`;
}

const pontosEmTexto = (pontos: Ponto[]) => pontos.map((x, i) => `${i + 1}. Trecho: "${x.trecho}" | Problema: ${x.problema} | Correção: ${x.sugestao}`).join('\n');

// ---------- passos ----------

const precisaSql = (d: Desenho) => d.usa_supabase && Boolean(d.modelo_dados?.trim());

async function carlaPropoe(p: Projeto) {
  const prefixo = prefixoDo(p);
  if (!p.prefixo_db) { await atualizar(p, { prefixo_db: prefixo }); p.prefixo_db = prefixo; }
  const anterior = await ultimoArtefato(p, 'arquitetura');
  const comentario = p.rascunho.comentario as string | undefined;
  const falha = p.rascunho.falha_migracao as string | undefined;
  const versao = (anterior?.versao ?? 0) + 1;
  await estado(p, 'carla', anterior ? 'digitando' : 'lendo');
  let pedido = `${await contexto(p)}\n\n${await regras(p)}\n\n`;
  if (anterior && (comentario || falha)) {
    pedido += `<arquitetura>\n${anterior.conteudo}\n</arquitetura>\n\n`;
    if (comentario) pedido += `O cliente pediu ajustes na arquitetura v${anterior.versao}:\n"${comentario}"\n\n`;
    if (falha) pedido += `A migração da arquitetura v${anterior.versao} falhou no banco com este erro:\n${falha}\n\n`;
    pedido += `Tarefa (passo 1 de 2, o SQL vem depois): entregue o desenho da arquitetura v${versao} resolvendo isso, com todos os campos. Mude só o necessário. Em "fala_para_diego", diga o que mudou.`;
  } else {
    pedido += `Tarefa (passo 1 de 2, o SQL vem depois): desenhe a arquitetura v${versao} do projeto "${p.nome}". Em "fala_para_diego", resuma a decisão mais importante.`;
  }
  const d = await perguntar<Desenho>(p, CARLA, pedido, FORMATO_CARLA, 'low', 9000);
  await fala(p, 'carla', 'diego', d.fala_para_diego);
  const proposta: Proposta = { ...d, sql: '' };
  await atualizar(p, {
    subpasso: precisaSql(d) ? 'carla_sql' : 'diego_revisa', passo_em: null, tentativas: 0,
    rascunho: { proposta, versao, ajustes: 0, ...(falha ? { falha_migracao: falha } : {}), ...(anterior ? { sql_anterior: await sqlDaVersao(p, anterior.versao) } : {}) },
  });
}

async function sqlDaVersao(p: Projeto, versao: number): Promise<string> {
  const { data } = await supabase.from('squad_artefatos').select('conteudo').eq('projeto_id', p.id).eq('tipo', 'sql').eq('versao', versao).maybeSingle();
  return data?.conteudo ?? '';
}

// Passo 2 da Carla: o SQL, a partir do modelo de dados do desenho.
async function carlaSql(p: Projeto) {
  const prefixo = prefixoDo(p);
  const versao = p.rascunho.versao as number;
  const r = p.rascunho.proposta as Proposta;
  const pontos = p.rascunho.pontos as Ponto[] | undefined;
  const falha = p.rascunho.falha_migracao as string | undefined;
  const sqlAnterior = (p.rascunho.sql_anterior as string | undefined) || r.sql;
  await estado(p, 'carla', 'digitando');
  let pedido = `${await regras(p)}\n\n<arquitetura>\n${montarDocumento(p, r, versao, prefixo)}\n</arquitetura>\n\n`;
  if (sqlAnterior) pedido += `SQL da versão anterior:\n${sqlAnterior}\n\n`;
  if (falha) pedido += `Essa migração falhou no banco com este erro:\n${falha}\n\n`;
  if (pontos?.length) pedido += `Apontamentos do Diego:\n${pontosEmTexto(pontos)}\n\n`;
  pedido += `Tarefa (passo 2 de 2): escreva o SQL completo do modelo de dados acima, só com os comandos que o executor aceita, tudo em public.${prefixo}*, com RLS e as políticas de cada operação. Sem comentários longos. Em "fala_para_diego", resuma as políticas.`;
  const s = await perguntar<{ sql: string; fala_para_diego: string }>(p, CARLA, pedido, FORMATO_CARLA_SQL, 'low', 7000);
  await fala(p, 'carla', 'diego', s.fala_para_diego);
  const proposta: Proposta = { ...r, sql: s.sql.trim() };
  if (pontos) {
    await concluirAjuste(p, proposta);
    return;
  }
  await atualizar(p, { subpasso: 'diego_revisa', passo_em: null, tentativas: 0, rascunho: { ...p.rascunho, proposta } });
}

async function diegoRevisa(p: Projeto) {
  const prefixo = prefixoDo(p);
  const r = p.rascunho.proposta as Proposta;
  const versao = p.rascunho.versao as number;
  const erros = await validarPlano(r, prefixo);
  await estado(p, 'diego', 'lendo');
  const rev = await perguntar<Revisao>(p, DIEGO, `${await contexto(p)}\n\n${await regras(p)}\n\n<arquitetura>\n${montarDocumento(p, r, versao, prefixo)}\n</arquitetura>\n\nValidação automática (executor de SQL e plano):\n${erros.length ? listar(erros) : '- nenhum erro'}\n\nTarefa: revise a arquitetura com o seu checklist. Em "fala_para_carla", dê o parecer.`, FORMATO_DIEGO, 'medium', 12000);
  const pontos: Ponto[] = [
    ...erros.map((e) => ({ trecho: 'validação automática', problema: e, sugestao: 'Corrigir conforme a regra.' })),
    ...rev.pontos,
  ];
  await fala(p, 'diego', 'carla', rev.fala_para_carla);
  if (pontos.length === 0) {
    await publicar(p, r, versao);
    return;
  }
  await atualizar(p, { subpasso: 'carla_ajusta', passo_em: null, tentativas: 0, rascunho: { ...p.rascunho, pontos } });
}

async function carlaAjusta(p: Projeto) {
  const prefixo = prefixoDo(p);
  const versao = p.rascunho.versao as number;
  const anterior = p.rascunho.proposta as Proposta;
  const pontos = p.rascunho.pontos as Ponto[];
  await estado(p, 'carla', 'digitando');
  const d = await perguntar<Desenho>(p, CARLA, `${await contexto(p)}\n\n${await regras(p)}\n\n<arquitetura>\n${montarDocumento(p, anterior, versao, prefixo)}\n</arquitetura>\n\nApontamentos do Diego:\n${pontosEmTexto(pontos)}\n\nTarefa (passo 1 de 2, o SQL vem depois): corrija os apontamentos de desenho e devolva o desenho completo (todos os campos). Pontos sobre SQL você resolve no passo 2, mas ajuste o modelo de dados se precisar. Em "fala_para_diego", confirme o que mudou.`, FORMATO_CARLA, 'low', 9000);
  await fala(p, 'carla', 'diego', d.fala_para_diego);
  const proposta: Proposta = { ...d, sql: precisaSql(d) ? anterior.sql : '' };
  if (precisaSql(d)) {
    await atualizar(p, { subpasso: 'carla_sql', passo_em: null, tentativas: 0, rascunho: { ...p.rascunho, proposta, sql_anterior: anterior.sql } });
    return;
  }
  await concluirAjuste(p, proposta);
}

// Depois do ajuste, só a validação automática decide: passa e publica, ou volta (até MAX_AJUSTES).
async function concluirAjuste(p: Projeto, r: Proposta) {
  const prefixo = prefixoDo(p);
  const versao = p.rascunho.versao as number;
  const erros = await validarPlano(r, prefixo);
  if (!erros.length) {
    await publicar(p, r, versao);
    return;
  }
  const ajustes = ((p.rascunho.ajustes as number) ?? 0) + 1;
  if (ajustes >= MAX_AJUSTES) throw new Error(`A arquitetura não passou na validação automática: ${erros.slice(0, 3).join(' | ')}`);
  await fala(p, 'diego', 'carla', `Ainda falta: ${erros[0]}${erros.length > 1 ? ` (e mais ${erros.length - 1})` : ''}. Volta para você.`);
  await atualizar(p, {
    subpasso: 'carla_ajusta', passo_em: null, tentativas: 0,
    rascunho: { proposta: r, versao, ajustes, pontos: erros.map((e) => ({ trecho: 'validação automática', problema: e, sugestao: 'Corrigir conforme a regra.' })) },
  });
}

async function publicar(p: Projeto, r: Proposta, versao: number) {
  const prefixo = prefixoDo(p);
  const doc = montarDocumento(p, r, versao, prefixo);
  const plano: Plano = { prefixo, usa_supabase: r.usa_supabase, sql: r.sql.trim(), arquivos: r.arquivos, tarefas: r.tarefas };
  const linhas = [
    { projeto_id: p.id, tipo: 'arquitetura', versao, conteudo: doc, autor: 'carla' },
    { projeto_id: p.id, tipo: 'plano', versao, conteudo: JSON.stringify(plano), autor: 'carla' },
  ];
  if (plano.sql) linhas.push({ projeto_id: p.id, tipo: 'sql', versao, conteudo: plano.sql, autor: 'carla' });
  const { error } = await supabase.from('squad_artefatos').insert(linhas);
  if (error) throw error;
  await emitir(p, 'artefato', 'carla', null, { dados: { tipo: 'arquitetura', titulo: 'Arquitetura e plano', autor: 'carla', conteudo: doc, versao } });
  await fala(p, 'carla', 'usuario', `Arquitetura v${versao} pronta${plano.sql ? ', com o SQL' : ''}: ${r.arquivos.length} arquivos e ${r.tarefas.length} tarefas. Aprova para começarmos o desenvolvimento?`);
  await atualizar(p, { etapa: 'aguardando_aprovacao_arquitetura', subpasso: null, passo_em: null, tentativas: 0, rodada_arq: versao, rascunho: {} });
  await emitir(p, 'portao', 'carla', null, {
    dados: { tipo: 'arquitetura', versao, titulo: `Aprovar arquitetura (v${versao})`, subtitulo: 'Portão 2 · o SQL só é aplicado depois da sua aprovação', conteudo: doc },
  });
}

async function diegoAplica(p: Projeto) {
  const artefato = await ultimoArtefato(p, 'plano', true);
  if (!artefato) throw new Error('Nenhuma arquitetura aprovada encontrada.');
  const plano = JSON.parse(artefato.conteudo) as Plano;

  if (plano.sql) {
    const { comandos, erros } = validarSql(plano.sql, plano.prefixo);
    let falha = erros.length ? erros.join(' | ') : null;
    if (!falha) {
      await estado(p, 'diego', 'digitando');
      await fala(p, 'diego', 'carla', `Aplicando a migração pelo executor seguro: ${comandos.length} comandos com o prefixo ${plano.prefixo}.`);
      const { data, error } = await supabase.rpc('squad_executar_migracao', { p_prefixo: plano.prefixo, p_comandos: comandos });
      if (error) falha = error.message;
      else await emitir(p, 'sistema', null, `Migração aplicada: ${data} comandos, tabelas ${plano.prefixo}* com RLS`, { sala: 'arquitetura' });
    }
    if (falha) {
      const { count } = await supabase.from('squad_artefatos').select('id', { count: 'exact', head: true })
        .eq('projeto_id', p.id).eq('tipo', 'plano').like('comentario', 'Migração falhou%');
      await supabase.from('squad_artefatos').update({ comentario: `Migração falhou: ${falha}`.slice(0, 1000) })
        .eq('projeto_id', p.id).eq('tipo', 'plano').eq('versao', artefato.versao);
      if ((count ?? 0) >= 1) throw new Error(`A migração falhou de novo: ${falha.slice(0, 200)}`);
      await fala(p, 'diego', 'carla', `A migração falhou no banco: ${falha.slice(0, 150)}. Nada foi aplicado. Volta para você corrigir o SQL.`);
      await atualizar(p, { etapa: 'arquitetura', subpasso: 'carla_propoe', passo_em: null, tentativas: 0, rascunho: { falha_migracao: falha } });
      return;
    }
  } else {
    await emitir(p, 'sistema', null, plano.usa_supabase ? 'Sem migração: o app usa o Supabase só para login' : 'Sem migração: o app não usa banco de dados', { sala: 'arquitetura' });
  }

  await fala(p, 'diego', 'carla', plano.sql ? 'Migração aplicada e conferida. Pode levar para o Desenvolvimento.' : 'Nada para aplicar no banco. Pode levar para o Desenvolvimento.');
  await emitir(p, 'handoff', 'carla', `Eduardo, arquitetura aprovada: ${plano.tarefas.length} tarefas e os contratos entre os módulos estão no documento.`, { para: 'eduardo', dados: { artefato: 'a arquitetura' } });
  await emitir(p, 'fase', null, 'Sala 3 · Desenvolvimento recebe a arquitetura', { sala: 'desenvolvimento' });
  await emitir(p, 'sistema', null, 'A Sala de Desenvolvimento entra em operação na Fase 3. O projeto fica salvo com a arquitetura aprovada.', { sala: 'desenvolvimento' });
  await atualizar(p, { etapa: 'planejamento', subpasso: null, passo_em: null, tentativas: 0, rascunho: {} });
}

export const PASSOS_ARQUITETURA = {
  arquitetura: { carla_propoe: carlaPropoe, carla_sql: carlaSql, diego_revisa: diegoRevisa, carla_ajusta: carlaAjusta },
  migracao: { diego_aplica: diegoAplica },
};
