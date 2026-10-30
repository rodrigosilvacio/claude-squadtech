// Esteira do SquadTech: executa UM passo de um projeto e o avança. Quem chama é o
// banco (trigger/cron via pg_net) com o header x-squad-interno; o próximo passo é
// disparado pelo trigger quando etapa/subpasso mudam. Cada passo cabe numa
// invocação (~150s) e vira eventos em squad_eventos.
// Deploy com verify_jwt desligado (a autenticação é o segredo interno).
//
// Salas: produto, arquitetura, desenvolvimento, testes e delivery (sala-*.ts).
// testes/navegador não é passo da esteira: espera o navegador do cliente (o trigger não dispara).
import { atualizar, CAMPOS_PROJETO, config, emitir, estado, type Projeto, supabase } from './nucleo.ts';
import { PASSOS_ARQUITETURA } from './sala-arquitetura.ts';
import { PASSOS_DELIVERY } from './sala-delivery.ts';
import { PASSOS_DESENVOLVIMENTO } from './sala-desenvolvimento.ts';
import { PASSOS_PRODUTO } from './sala-produto.ts';
import { PASSOS_TESTES } from './sala-testes.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const PASSOS: Record<string, Record<string, (p: Projeto) => Promise<void>>> = {
  ...PASSOS_PRODUTO, ...PASSOS_ARQUITETURA, ...PASSOS_DESENVOLVIMENTO, ...PASSOS_TESTES, ...PASSOS_DELIVERY,
};
const PRIMEIRO: Record<string, string> = {
  entrevista: 'ana_analisa', prd: 'bruno_escreve', arquitetura: 'carla_propoe', migracao: 'diego_aplica',
  planejamento: 'eduardo_planeja', desenvolvimento: 'dev_arquivo', integracao: 'eduardo_integra', testes: 'julia_revisa', delivery: 'lucas_documenta',
};
const ETAPAS_AUTOMATICAS = Object.keys(PASSOS);
const AGENTES = ['ana', 'bruno', 'carla', 'diego', 'eduardo', 'fernanda', 'gabriel', 'helena', 'igor', 'julia', 'lucas'];

function iguais(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function executar(id: string) {
  // Trava o passo: só uma invocação por vez (a trava expira em 4 min, igual ao cron).
  const limite = new Date(Date.now() - 4 * 60_000).toISOString();
  const { data, error } = await supabase
    .from('squad_projetos')
    .update({ passo_em: new Date().toISOString() })
    .eq('id', id)
    .in('etapa', ETAPAS_AUTOMATICAS)
    .is('erro', null)
    .or(`passo_em.is.null,passo_em.lt.${limite}`)
    .select(CAMPOS_PROJETO)
    .maybeSingle();
  if (error) throw error;
  if (!data) return;
  const p = data as Projeto;
  const subpasso = p.subpasso ?? PRIMEIRO[p.etapa];
  if (subpasso === 'navegador') {
    await atualizar(p, { passo_em: null }); // espera o navegador do cliente; nada a fazer aqui
    return;
  }
  const passo = PASSOS[p.etapa]?.[subpasso];
  try {
    if (!passo) throw new Error(`Passo desconhecido: ${p.etapa}/${subpasso}`);
    await passo(p);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`passo ${p.etapa}/${subpasso} do projeto ${p.id} falhou:`, msg);
    await atualizar(p, { erro: msg.slice(0, 500), passo_em: null });
    const prefixo = subpasso.split('_')[0]; // ana_analisa → ana; dev_* → Eduardo, que coordena os devs
    const agente = AGENTES.includes(prefixo) ? prefixo : 'eduardo';
    await estado(p, agente, 'erro');
    await emitir(p, 'sistema', null, `A esteira parou: ${msg.slice(0, 200).replace(/\.+$/, '')}. Use "Retomar" para tentar de novo.`, { dados: { erro: true } });
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('use POST', { status: 405 });
  const cfg = await config();
  if (!iguais(req.headers.get('x-squad-interno') ?? '', cfg.segredo_interno)) {
    return new Response('não autorizado', { status: 401 });
  }
  const { id } = await req.json().catch(() => ({}));
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) return new Response('id inválido', { status: 400 });
  // Responde na hora (o pg_net não espera) e trabalha em segundo plano.
  EdgeRuntime.waitUntil(executar(id).catch((e) => console.error('falha na esteira:', e)));
  return new Response(JSON.stringify({ ok: true }), { status: 202, headers: { 'Content-Type': 'application/json' } });
});
