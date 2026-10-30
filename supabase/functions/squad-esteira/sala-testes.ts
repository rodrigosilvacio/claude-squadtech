// Sala 4 · Testes (Júlia e Igor)
//   testes: julia_revisa → igor_planeja → navegador → igor_avalia → [qa_corrige → navegador ...] → delivery
// "navegador" não é um passo da esteira: o escritório aberto no navegador do cliente
// roda os testes do Igor no app (iframe servido por service worker) e devolve o
// resultado pelo squad-pedir, que avança para igor_avalia. O loop de correção
// tem no máximo max_rodadas_qa rodadas; depois disso entrega com as pendências documentadas.
import { atualizar, config, emitir, estado, fala, perguntar, type Projeto, supabase, ultimoArtefato } from './nucleo.ts';
import { ACOES_TESTE, FORMATO_IGOR_AVALIACAO, FORMATO_IGOR_PLANO, FORMATO_JULIA, IGOR, JULIA } from './prompts.ts';
import { garantirConfig } from './sala-delivery.ts';
import {
  arquivosGerados, avisoEnxuto, carregarPlano, codigoPronto, contextoProjeto, conteudos, donoDo, escreverArquivo,
  pedidoArquivo, pedirVersaoEnxuta, type Ponto, salvarArquivo,
} from './sala-desenvolvimento.ts';
import { verificarArquivos } from './verificacoes.ts';

const NOME: Record<string, string> = { eduardo: 'Eduardo', fernanda: 'Fernanda', gabriel: 'Gabriel', helena: 'Helena' };

export interface PassoTeste { acao: string; alvo: string; valor: string }
export interface Teste { id: string; nome: string; criterio: string; passos: PassoTeste[] }
interface PontoJulia extends Ponto { severidade: 'bloqueante' | 'melhoria' }
interface Resultado { id: string; nome: string; ok: boolean; erro?: string; passo?: number; console?: string[]; tela?: string }

// Testes válidos: ações conhecidas, começam abrindo uma página, com limite de tamanho.
function validarTestes(testes: Teste[]): Teste[] {
  const vistos = new Set<string>();
  return testes
    .map((t, i) => ({ ...t, id: (t.id || `T${i + 1}`).replace(/[^\w-]/g, '').slice(0, 20) || `T${i + 1}`, passos: t.passos.filter((x) => ACOES_TESTE.includes(x.acao)).slice(0, 30) }))
    .filter((t) => t.passos.length && ['abrir', 'abrir_sem_login'].includes(t.passos[0].acao) && !vistos.has(t.id) && vistos.add(t.id))
    .slice(0, 12);
}

const listaPontos = (pontos: Ponto[]) => pontos.map((x) => `- **${x.arquivo}**: ${x.problema} _Correção:_ ${x.correcao}`).join('\n');

function testesMarkdown(testes: Teste[], manual: string[]): string {
  const auto = testes.map((t) => `### ${t.id} · ${t.nome}\n_Critério:_ ${t.criterio}\n\n${t.passos.map((x, i) => `${i + 1}. \`${x.acao}\` ${[x.alvo, x.valor].filter(Boolean).map((v) => `\`${v}\``).join(' → ')}`).join('\n')}`).join('\n\n');
  return `## Testes automáticos (rodam no navegador)\n\n${auto}\n\n## Roteiro manual\n\n${manual.length ? manual.map((m) => `- ${m}`).join('\n') : '- Nenhum item.'}`;
}

// ---------- Júlia: revisão estática ----------

async function juliaRevisa(p: Projeto) {
  const { plano } = await carregarPlano(p);
  const cfg = await config();
  const gerados = await arquivosGerados(p);
  const ordem = (p.rascunho.ordem as string[]) ?? plano.arquivos.map((a) => a.caminho);
  const automaticos = verificarArquivos(conteudos(gerados), plano, Number(cfg.max_caracteres_arquivo));
  const sql = await ultimoArtefato(p, 'sql');
  await estado(p, 'julia', 'lendo');
  const r = await perguntar<{ fala_para_igor: string; pontos: PontoJulia[] }>(p, { contexto: await contextoProjeto(p), persona: JULIA }, [
    ...codigoPronto(gerados, ordem, ''),
    { texto: `${sql ? `SQL aplicado no banco:\n${sql.conteudo}\n\n` : ''}Verificação automática:\n${automaticos.length ? automaticos.map((x) => `- ${x.arquivo}: ${x.problema}`).join('\n') : '- nenhum problema'}\n\nTarefa: faça a revisão de código e segurança pelo seu checklist. Cada ponto com arquivo (caminho exato), problema, correção e severidade. Em "fala_para_igor", resuma o parecer em uma frase.` },
  ], FORMATO_JULIA, 'medium', 10000);

  const caminhos = new Set(plano.arquivos.map((a) => a.caminho));
  const pontos = [
    ...automaticos.filter((x) => caminhos.has(x.arquivo)).map((x) => ({ arquivo: x.arquivo, problema: x.problema, correcao: 'Corrigir conforme a verificação automática.', severidade: 'bloqueante' as const })),
    ...r.pontos.filter((x) => caminhos.has(x.arquivo)),
  ];
  const bloqueantes = pontos.filter((x) => x.severidade === 'bloqueante');
  await supabase.from('squad_testes').insert({ projeto_id: p.id, rodada: p.rodada_qa, origem: 'revisao', aprovado: !bloqueantes.length, resultado: { pontos } });
  const md = `## Bloqueantes\n\n${bloqueantes.length ? listaPontos(bloqueantes) : '- Nenhum.'}\n\n## Melhorias (documentadas)\n\n${listaPontos(pontos.filter((x) => x.severidade === 'melhoria')) || '- Nenhuma.'}`;
  await emitir(p, 'artefato', 'julia', null, { dados: { tipo: 'revisao_codigo', titulo: 'Revisão de código e segurança', autor: 'julia', conteudo: md } });
  await fala(p, 'julia', 'igor', r.fala_para_igor);
  await atualizar(p, { subpasso: 'igor_planeja', passo_em: null, tentativas: 0, rascunho: { ...p.rascunho, julia: pontos, julia_pendente: bloqueantes.length > 0 } });
}

// ---------- Igor: testes a partir dos critérios de aceite ----------

async function igorPlaneja(p: Projeto) {
  const { plano } = await carregarPlano(p);
  await garantirConfig(p);
  const gerados = await arquivosGerados(p);
  const ordem = (p.rascunho.ordem as string[]) ?? plano.arquivos.map((a) => a.caminho);
  await estado(p, 'igor', 'digitando');
  const r = await perguntar<{ fala_para_julia: string; testes: Teste[]; roteiro_manual: string[] }>(p, { contexto: await contextoProjeto(p), persona: IGOR }, [
    ...codigoPronto(gerados, ordem, ''),
    { texto: `Tarefa: escreva os testes automáticos dos critérios de aceite do PRD para este código, usando seletores que existem nele. O que não dá para automatizar vai em "roteiro_manual". Em "fala_para_julia", comente em uma frase o que vai cobrir.` },
  ], FORMATO_IGOR_PLANO, 'medium', 12000);
  const testes = validarTestes(r.testes);
  if (!testes.length) throw new Error('O Igor não gerou nenhum teste válido.');

  await supabase.from('squad_artefatos').delete().eq('projeto_id', p.id).eq('tipo', 'testes').eq('caminho', 'plano-testes');
  await supabase.from('squad_artefatos').insert({ projeto_id: p.id, tipo: 'testes', caminho: 'plano-testes', versao: 1, conteudo: JSON.stringify({ testes, manual: r.roteiro_manual }), autor: 'igor' });
  await emitir(p, 'artefato', 'igor', null, { dados: { tipo: 'testes', titulo: `Plano de testes (${testes.length})`, autor: 'igor', conteudo: testesMarkdown(testes, r.roteiro_manual) } });
  await fala(p, 'igor', 'julia', r.fala_para_julia);
  await irParaNavegador({ ...p, rascunho: { ...p.rascunho, testes, manual: r.roteiro_manual } }, testes.length);
}

async function irParaNavegador(p: Projeto, n: number) {
  await emitir(p, 'estado', 'igor', null, { dados: { estado: 'aguardando', painel: 'rodando' } });
  await fala(p, 'igor', 'usuario', `Rodrigo, ${n} testes prontos (rodada ${p.rodada_qa}). Com o SquadTech aberto, eles rodam no seu navegador e eu leio o resultado.`);
  await atualizar(p, { subpasso: 'navegador', passo_em: null, tentativas: 0, rascunho: p.rascunho });
}

// ---------- Igor: lê o resultado e decide ----------

async function ultimoResultado(p: Projeto) {
  const { data, error } = await supabase.from('squad_testes').select('aprovado, resultado').eq('projeto_id', p.id)
    .eq('rodada', p.rodada_qa).eq('origem', 'navegador').order('criado_em', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Resultado dos testes no navegador não encontrado.');
  return data.resultado as { pulado?: boolean; testes?: Resultado[] };
}

async function igorAvalia(p: Projeto) {
  const { plano } = await carregarPlano(p);
  const cfg = await config();
  const res = await ultimoResultado(p);
  const testes = (p.rascunho.testes as Teste[]) ?? [];
  const julia = ((p.rascunho.julia as PontoJulia[]) ?? []).filter((x) => x.severidade === 'bloqueante');
  const pendentesJulia = p.rascunho.julia_pendente ? julia : [];

  if (res.pulado) {
    await fala(p, 'igor', 'lucas', 'Os testes no navegador foram pulados a pedido do Rodrigo. Vai registrado no relatório.');
    await irParaDelivery(p, { pulado: true, resultados: [], pendencias: pendentesJulia });
    return;
  }
  const resultados = res.testes ?? [];
  const falhos = resultados.filter((t) => !t.ok);
  await estado(p, 'igor', 'lendo');

  let falhas: Ponto[] = [];
  let novosTestes = testes;
  if (falhos.length) {
    const gerados = await arquivosGerados(p);
    const ordem = (p.rascunho.ordem as string[]) ?? plano.arquivos.map((a) => a.caminho);
    const detalhes = falhos.map((t) => {
      const def = testes.find((x) => x.id === t.id);
      return `### ${t.id} · ${t.nome}\nPassos: ${JSON.stringify(def?.passos ?? [])}\nFalhou no passo ${t.passo ?? '?'}: ${t.erro ?? '-'}\nErros no console: ${(t.console ?? []).join(' | ') || 'nenhum'}\nTexto da tela no momento da falha:\n${(t.tela ?? '').slice(0, 1500)}`;
    }).join('\n\n');
    const r = await perguntar<{ fala_para_time: string; falhas: Ponto[]; testes_ajustados: Teste[] }>(p, { contexto: await contextoProjeto(p), persona: IGOR }, [
      ...codigoPronto(gerados, ordem, ''),
      { texto: `Rodada ${p.rodada_qa} no navegador: ${resultados.length - falhos.length} de ${resultados.length} testes passaram.\n\nTestes que falharam:\n${detalhes}\n\nTarefa: para cada falha, decida a causa olhando o código. Se for defeito do app, registre em "falhas" o arquivo (caminho exato), o problema e a correção. Se o defeito for do teste (seletor errado, espera curta, passo que não existe no app), devolva o teste corrigido em "testes_ajustados" com o mesmo id. Em "fala_para_time", diga o resultado e o que volta para o time.` },
    ], FORMATO_IGOR_AVALIACAO, 'medium', 12000);
    const caminhos = new Set(plano.arquivos.map((a) => a.caminho));
    falhas = r.falhas.filter((x) => caminhos.has(x.arquivo));
    const ajustados = new Map(validarTestes(r.testes_ajustados).map((t) => [t.id, t]));
    novosTestes = testes.map((t) => ajustados.get(t.id) ?? t);
    await fala(p, 'igor', 'eduardo', r.fala_para_time);
    if (ajustados.size && !falhas.length && !pendentesJulia.length && p.rodada_qa < Number(cfg.max_rodadas_qa)) {
      // Só os testes estavam errados: roda de novo sem mexer no código.
      await atualizar(p, { rodada_qa: p.rodada_qa + 1 });
      await irParaNavegador({ ...p, rodada_qa: p.rodada_qa + 1, rascunho: { ...p.rascunho, testes: novosTestes } }, novosTestes.length);
      return;
    }
  } else {
    await fala(p, 'igor', 'julia', `Os ${resultados.length} testes passaram no navegador${pendentesJulia.length ? ', mas ainda tem bloqueante seu para corrigir' : ''}.`);
  }

  const pontos = [...pendentesJulia, ...falhas];
  if (!pontos.length) {
    await irParaDelivery(p, { resultados, pendencias: [] });
    return;
  }
  if (p.rodada_qa >= Number(cfg.max_rodadas_qa)) {
    await fala(p, 'igor', 'lucas', `Chegamos ao limite de ${cfg.max_rodadas_qa} rodadas. Entrego com ${pontos.length} pendências documentadas no relatório.`);
    await irParaDelivery(p, { resultados, pendencias: pontos });
    return;
  }
  const ordem = (p.rascunho.ordem as string[]) ?? plano.arquivos.map((a) => a.caminho);
  const fila = ordem.filter((c) => pontos.some((x) => x.arquivo === c));
  const primeiro = donoDo(plano, fila[0]);
  await emitir(p, 'handoff', 'igor', `${NOME[primeiro] ?? 'Time'}, começa por ${fila[0]}.`, { para: primeiro, dados: { artefato: 'o relatório de falhas' } });
  await atualizar(p, {
    subpasso: 'qa_corrige', passo_em: null, tentativas: 0,
    rascunho: { ...p.rascunho, testes: novosTestes, julia_pendente: false, pontos_qa: pontos, fila, corrigidos: [], ultimos_resultados: resultados },
  });
}

// ---------- devs corrigem o que o QA apontou ----------

async function qaCorrige(p: Projeto) {
  const { plano } = await carregarPlano(p);
  const cfg = await config();
  const fila = p.rascunho.fila as string[];
  const corrigidos = (p.rascunho.corrigidos as string[]) ?? [];
  const pontos = p.rascunho.pontos_qa as Ponto[];
  const caminho = fila.find((c) => !corrigidos.includes(c));
  if (caminho) {
    const agente = donoDo(plano, caminho);
    const gerados = await arquivosGerados(p);
    const atual = gerados.get(caminho);
    const meus = pontos.filter((x) => x.arquivo === caminho).map((x, i) => `${i + 1}. ${x.problema} Correção: ${x.correcao}`).join('\n');
    await estado(p, agente, 'digitando');
    const r = await escreverArquivo(p, agente,
      await pedidoArquivo(p, caminho, `\nVersão atual do seu arquivo:\n--- ${caminho} ---\n${atual?.conteudo ?? '(não gerado)'}\n\nO QA (Igor e Júlia) apontou:\n${meus}\n\nTarefa: devolva o arquivo ${caminho} completo e corrigido (até ${cfg.max_caracteres_arquivo} caracteres), mudando só o necessário.${avisoEnxuto(p, caminho)}`, gerados));
    if (!r) {
      await pedirVersaoEnxuta(p, agente, caminho, 'qa_corrige');
      return;
    }
    await salvarArquivo(p, caminho, r.conteudo, agente, (atual?.versao ?? 0) + 1);
    await fala(p, agente, 'igor', r.fala);
    const novos = [...corrigidos, caminho];
    if (novos.length < fila.length) {
      await atualizar(p, { subpasso: 'qa_corrige', passo_em: null, tentativas: 0, rascunho: { ...p.rascunho, corrigidos: novos } });
      return;
    }
  }
  // Rodada fechada: os mesmos testes rodam de novo no navegador.
  const testes = (p.rascunho.testes as Teste[]) ?? [];
  const historico = [...((p.rascunho.correcoes as Ponto[]) ?? []), ...pontos];
  await atualizar(p, { rodada_qa: p.rodada_qa + 1 });
  await irParaNavegador({ ...p, rodada_qa: p.rodada_qa + 1, rascunho: { ...p.rascunho, correcoes: historico, pontos_qa: [], fila: [], corrigidos: [] } }, testes.length);
}

// ---------- fecha a Sala 4 ----------

async function irParaDelivery(p: Projeto, qa: { pulado?: boolean; resultados: Resultado[]; pendencias: Ponto[] }) {
  const passaram = qa.resultados.filter((t) => t.ok).length;
  await estado(p, 'igor', qa.pendencias.length ? 'livre' : 'comemorando');
  await emitir(p, 'handoff', 'igor', qa.pulado ? 'Lucas, os testes foram pulados. Pode preparar a entrega.' : `Lucas, ${passaram} de ${qa.resultados.length} testes passando. Pode preparar a entrega.`, { para: 'lucas', dados: { artefato: 'o relatório de testes' } });
  await emitir(p, 'fase', null, 'Sala 5 · Delivery prepara a entrega', { sala: 'delivery' });
  await atualizar(p, {
    etapa: 'delivery', subpasso: 'lucas_documenta', passo_em: null, tentativas: 0,
    rascunho: {
      pontos_integracao: p.rascunho.pontos_integracao, verificacao_final: p.rascunho.verificacao_final,
      qa: {
        rodadas: p.rodada_qa, pulado: qa.pulado ?? false, testes: p.rascunho.testes ?? [], resultados: qa.resultados,
        manual: p.rascunho.manual ?? [], julia: p.rascunho.julia ?? [], correcoes: p.rascunho.correcoes ?? [], pendencias: qa.pendencias,
      },
    },
  });
}

export const PASSOS_TESTES = {
  testes: { julia_revisa: juliaRevisa, igor_planeja: igorPlaneja, igor_avalia: igorAvalia, qa_corrige: qaCorrige },
};
