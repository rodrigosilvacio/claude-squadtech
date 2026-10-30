// Sala 1 · Produto (Ana e Bruno)
//   entrevista: ana_analisa → bruno_critica → ana_pergunta → (aguardando_respostas | prd)
//   prd:        bruno_escreve → ana_revisa → [bruno_ajusta] → aguardando_aprovacao_prd
import { atualizar, config, emitir, estado, fala, listar, perguntar, type Projeto, supabase, ultimoArtefato } from './nucleo.ts';
import {
  ANA, BRUNO, FORMATO_ANA_ANALISE, FORMATO_ANA_PERGUNTAS, FORMATO_ANA_REVISAO,
  FORMATO_BRUNO_AJUSTE, FORMATO_BRUNO_CRITICA, FORMATO_BRUNO_PRD,
} from './prompts.ts';

const MAX_PERGUNTAS = 5;

// Briefing + todas as rodadas de perguntas e respostas + ajustes pedidos no PRD.
// Os ajustes vêm depois da entrevista e prevalecem sobre ela.
export async function contexto(p: Projeto): Promise<string> {
  const { data, error } = await supabase.from('squad_artefatos')
    .select('tipo, versao, caminho, conteudo, comentario').eq('projeto_id', p.id).in('tipo', ['respostas', 'prd', 'briefing']).order('versao');
  if (error) throw error;
  const rodadas = data.filter((a) => a.tipo === 'respostas').map((a) => `Rodada ${a.versao}:\n${a.conteudo}`).join('\n\n');
  const ajustes = [
    ...data.filter((a) => a.tipo === 'prd' && a.comentario).map((a) => `- Sobre o PRD v${a.versao}: ${a.comentario}`),
    ...data.filter((a) => a.tipo === 'briefing' && a.caminho?.startsWith('ajuste-')).map((a) => `- Evolução pedida depois da entrega (ciclo ${a.versao}): ${a.conteudo}`),
  ].join('\n');
  return `<briefing>\nNome do projeto: ${p.nome}\n\n${p.briefing}\n</briefing>\n\n<entrevista>\n${rodadas || 'Ainda não houve perguntas ao cliente.'}${ajustes ? `\n\nAjustes que o cliente pediu depois, ao revisar o PRD. São as decisões mais recentes e prevalecem sobre as respostas acima:\n${ajustes}` : ''}\n</entrevista>`;
}

// ---------- entrevista ----------

interface Analise { fala_para_bruno: string; lacunas: string[]; suficiente: boolean; fora_do_escopo: boolean; motivo_fora_do_escopo: string }
interface Critica { fala_para_ana: string; lacunas_adicionais: string[]; concorda_suficiente: boolean }
interface Perguntas { suficiente: boolean; fala_para_bruno: string; fala_para_usuario: string; perguntas: { pergunta: string; porque: string; sugestao: string }[]; premissas: string[] }

async function anaAnalisa(p: Projeto) {
  await estado(p, 'ana', 'lendo');
  const r = await perguntar<Analise>(p, ANA, `${await contexto(p)}\n\nTarefa: analise o briefing${p.rodada_po > 1 ? ' e as respostas do cliente' : ''}. Liste as lacunas que ainda impedem um bom PRD, diga se o contexto já é suficiente e se o pedido está fora do escopo. Em "fala_para_bruno", conte ao Bruno o que você entendeu e o que falta.`, FORMATO_ANA_ANALISE, 'low', 3000);
  await fala(p, 'ana', 'bruno', r.fala_para_bruno);
  if (r.fora_do_escopo) {
    await fala(p, 'ana', 'usuario', r.motivo_fora_do_escopo);
    await atualizar(p, { etapa: 'escalado', subpasso: null, passo_em: null, pendencias: r.motivo_fora_do_escopo });
    await emitir(p, 'fim', 'ana', 'Projeto encerrado: fora do escopo do SquadTech', { dados: { escalado: true, resumo: r.motivo_fora_do_escopo } });
    return;
  }
  await atualizar(p, { subpasso: 'bruno_critica', passo_em: null, tentativas: 0, rascunho: { analise: r } });
}

async function brunoCritica(p: Projeto) {
  const analise = p.rascunho.analise as Analise;
  await estado(p, 'bruno', 'pensando');
  const r = await perguntar<Critica>(p, BRUNO, `${await contexto(p)}\n\nAnálise da Ana:\nLacunas:\n${listar(analise.lacunas)}\nEla acha que o contexto ${analise.suficiente ? 'já é suficiente' : 'ainda não é suficiente'}.\n\nTarefa: critique a análise antes de falarmos com o cliente. O que faria o PRD falhar? Aponte só lacunas novas e relevantes (métrica de sucesso, regras de negócio, perfis de usuário, volume, dados pessoais). Diga se concorda que já dá para escrever o PRD. Em "fala_para_ana", responda à Ana.`, FORMATO_BRUNO_CRITICA, 'low', 2500);
  await fala(p, 'bruno', 'ana', r.fala_para_ana);
  await atualizar(p, { subpasso: 'ana_pergunta', passo_em: null, tentativas: 0, rascunho: { ...p.rascunho, critica: r } });
}

async function anaPergunta(p: Projeto) {
  const cfg = await config();
  const analise = p.rascunho.analise as Analise;
  const critica = p.rascunho.critica as Critica;
  const ultima = p.rodada_po >= Number(cfg.max_rodadas_perguntas);
  await estado(p, 'ana', 'digitando');
  const r = await perguntar<Perguntas>(p, ANA, `${await contexto(p)}\n\nSuas lacunas:\n${listar(analise.lacunas)}\nLacunas do Bruno:\n${listar(critica.lacunas_adicionais)}\nO Bruno ${critica.concorda_suficiente ? 'concorda' : 'não concorda'} que já dá para escrever o PRD.\n\nTarefa: decida. Se ainda faltar algo importante, escreva até ${MAX_PERGUNTAS} perguntas ao cliente (rodada ${p.rodada_po}). Se o contexto for suficiente, marque "suficiente" e deixe "perguntas" vazia. ${ultima ? 'ATENÇÃO: esta é a última rodada permitida. Marque "suficiente" e transforme as lacunas restantes em premissas razoáveis.' : ''} Em "premissas", liste o que o squad vai assumir. "fala_para_bruno" fecha a conversa com o Bruno; "fala_para_usuario" fala com o cliente (apresenta as perguntas ou avisa que o PRD vai ser escrito).`, FORMATO_ANA_PERGUNTAS, 'low', 4000);
  await fala(p, 'ana', 'bruno', r.fala_para_bruno);
  const perguntas = r.perguntas.slice(0, MAX_PERGUNTAS);

  if (r.suficiente || ultima || perguntas.length === 0) {
    await fala(p, 'ana', 'usuario', r.fala_para_usuario);
    await atualizar(p, { etapa: 'prd', subpasso: 'bruno_escreve', passo_em: null, tentativas: 0, rascunho: { premissas: r.premissas } });
    return;
  }

  const md = perguntas.map((q, i) => `${i + 1}. **${q.pergunta}**  \n_${q.porque}_`).join('\n\n');
  const { error } = await supabase.from('squad_artefatos').insert({ projeto_id: p.id, tipo: 'perguntas', versao: p.rodada_po, conteudo: md, autor: 'ana' });
  if (error) throw error;
  await emitir(p, 'artefato', 'ana', null, { dados: { tipo: 'perguntas', titulo: `Perguntas da Ana (rodada ${p.rodada_po})`, autor: 'ana', conteudo: md, versao: p.rodada_po } });
  await fala(p, 'ana', 'usuario', r.fala_para_usuario);
  await atualizar(p, { etapa: 'aguardando_respostas', subpasso: null, passo_em: null, tentativas: 0, rascunho: { premissas: r.premissas, perguntas } });
  await emitir(p, 'portao', 'ana', null, {
    dados: {
      tipo: 'perguntas', rodada: p.rodada_po, titulo: `Perguntas da Ana (rodada ${p.rodada_po})`, subtitulo: 'Sala 1 · Produto',
      intro: 'Responda com o máximo de contexto. A sugestão já vem preenchida: ajuste o que quiser ou marque "Decida você".',
      perguntas,
    },
  });
}

// ---------- PRD ----------

interface Prd { prd_markdown: string; fala_para_ana: string }
interface Revisao { aprovado: boolean; pontos: { trecho: string; problema: string; sugestao: string }[]; fala_para_bruno: string }

async function brunoEscreve(p: Projeto) {
  const premissas = (p.rascunho.premissas as string[] | undefined) ?? [];
  const anterior = await ultimoArtefato(p, 'prd');
  const comentario = p.rascunho.comentario as string | undefined;
  const versao = (anterior?.versao ?? 0) + 1;
  await estado(p, 'bruno', 'digitando');
  let pedido = `${await contexto(p)}\n\nPremissas do squad:\n${listar(premissas)}\n\nData de hoje: ${new Date().toLocaleDateString('pt-BR')}.\n\n`;
  if (anterior && comentario && p.rascunho.ajuste) {
    pedido += `<prd>\n${anterior.conteudo}\n</prd>\n\nO app do PRD v${anterior.versao} já foi entregue e está em uso. O cliente pediu uma evolução (ciclo ${p.ciclo}):\n"${comentario}"\n\nTarefa: escreva o PRD v${versao} incorporando a evolução. Mantenha o que já existe, atualize requisitos e critérios de aceite afetados e acrescente uma seção "Mudanças nesta versão" logo depois do resumo executivo. Se o pedido estiver fora do escopo da stack, registre a adaptação. Em "fala_para_ana", diga o que mudou.`;
  } else if (anterior && comentario) {
    pedido += `<prd>\n${anterior.conteudo}\n</prd>\n\nO cliente pediu ajustes no PRD v${anterior.versao}:\n"${comentario}"\n\nTarefa: escreva o PRD v${versao} aplicando o ajuste. Mude só o necessário e mantenha o resto. Em "fala_para_ana", diga o que mudou.`;
  } else {
    pedido += `Tarefa: escreva o PRD v${versao} completo. Em "fala_para_ana", peça a revisão dela destacando a decisão de escopo mais importante.`;
  }
  const r = await perguntar<Prd>(p, BRUNO, pedido, FORMATO_BRUNO_PRD, 'low', 12000);
  await fala(p, 'bruno', 'ana', r.fala_para_ana);
  await atualizar(p, { subpasso: 'ana_revisa', passo_em: null, tentativas: 0, rascunho: { ...p.rascunho, prd: r.prd_markdown, versao } });
}

async function anaRevisa(p: Projeto) {
  await estado(p, 'ana', 'lendo');
  const r = await perguntar<Revisao>(p, ANA, `${await contexto(p)}\n\n<prd>\n${p.rascunho.prd}\n</prd>\n\nTarefa: revise o PRD do Bruno contra o que o cliente disse. Reprove só por problema real: requisito que contradiz o cliente, métrica de sucesso ausente, critério de aceite que não dá para testar, escopo fora da stack, dado pessoal sem cuidado de LGPD. Para cada problema, cite o trecho, o problema e a correção. Em "fala_para_bruno", dê o parecer.`, FORMATO_ANA_REVISAO, 'medium', 8000);
  await fala(p, 'ana', 'bruno', r.fala_para_bruno);
  // Mesmo aprovando, a Ana costuma pedir detalhes: o Bruno aplica antes de publicar.
  if (r.pontos.length === 0) {
    await publicarPrd(p, p.rascunho.prd as string);
    return;
  }
  await atualizar(p, { subpasso: 'bruno_ajusta', passo_em: null, tentativas: 0, rascunho: { ...p.rascunho, revisao: r } });
}

async function brunoAjusta(p: Projeto) {
  const rev = p.rascunho.revisao as Revisao;
  await estado(p, 'bruno', 'digitando');
  const pontos = rev.pontos.map((x, i) => `${i + 1}. Trecho: "${x.trecho}" | Problema: ${x.problema} | Correção: ${x.sugestao}`).join('\n');
  const r = await perguntar<Prd>(p, BRUNO, `${await contexto(p)}\n\n<prd>\n${p.rascunho.prd}\n</prd>\n\nApontamentos da Ana:\n${pontos}\n\nTarefa: corrija todos os apontamentos e devolva o PRD completo. Em "fala_para_ana", confirme o que mudou.`, FORMATO_BRUNO_AJUSTE, 'low', 12000);
  await fala(p, 'bruno', 'ana', r.fala_para_ana);
  await publicarPrd(p, r.prd_markdown);
}

async function publicarPrd(p: Projeto, prd: string) {
  const versao = p.rascunho.versao as number;
  const { error } = await supabase.from('squad_artefatos').insert({ projeto_id: p.id, tipo: 'prd', versao, conteudo: prd, autor: 'bruno' });
  if (error) throw error;
  await emitir(p, 'artefato', 'bruno', null, { dados: { tipo: 'prd', titulo: 'PRD', autor: 'bruno', conteudo: prd, versao } });
  await fala(p, 'bruno', 'usuario', `PRD v${versao} pronto. Preciso da sua aprovação para seguir para a Arquitetura.`);
  await atualizar(p, { etapa: 'aguardando_aprovacao_prd', subpasso: null, passo_em: null, tentativas: 0, rascunho: { premissas: p.rascunho.premissas ?? [] } });
  await emitir(p, 'portao', 'bruno', null, {
    dados: { tipo: 'prd', versao, titulo: `Aprovar PRD (v${versao})`, subtitulo: 'Portão 1 · nada avança sem a sua decisão', conteudo: prd },
  });
}

export const PASSOS_PRODUTO = {
  entrevista: { ana_analisa: anaAnalisa, bruno_critica: brunoCritica, ana_pergunta: anaPergunta },
  prd: { bruno_escreve: brunoEscreve, ana_revisa: anaRevisa, bruno_ajusta: brunoAjusta },
};
