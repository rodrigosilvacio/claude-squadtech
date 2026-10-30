// O squad: 11 agentes com nome, cargo, sala, mesa e visual próprio.
// `mesa` é o tile esquerdo da mesa (2 tiles de largura); a cadeira fica logo abaixo.
// estilos de cabelo: curto, longo, cacheado, coque, rabo, raspado
// acessórios: oculos, fone

export const AGENTES = [
  {
    id: 'ana', nome: 'Ana', cargo: 'PO Entrevistadora', sala: 'produto', mesa: { x: 2, y: 3 },
    papel: 'Lê o briefing e faz as perguntas ao cliente',
    visual: { pele: '#f1c7a5', cabelo: '#5a3825', estilo: 'longo', roupa: '#e76f51', calca: '#2b2d42' },
  },
  {
    id: 'bruno', nome: 'Bruno', cargo: 'PO Redator e Crítico', sala: 'produto', mesa: { x: 9, y: 3 },
    papel: 'Aponta lacunas e escreve o PRD',
    visual: { pele: '#c68a62', cabelo: '#1d1d1d', estilo: 'curto', roupa: '#2a9d8f', calca: '#3d405b' },
  },
  {
    id: 'carla', nome: 'Carla', cargo: 'Arquiteta Proponente', sala: 'arquitetura', mesa: { x: 15, y: 3 },
    papel: 'Desenha telas, arquivos, dados e o plano de tarefas',
    visual: { pele: '#8d5a3b', cabelo: '#140e0b', estilo: 'cacheado', roupa: '#f4a261', calca: '#2b2d42' },
  },
  {
    id: 'diego', nome: 'Diego', cargo: 'Arquiteto Revisor', sala: 'arquitetura', mesa: { x: 22, y: 3 },
    papel: 'Revisa segurança, viabilidade no Pages, RLS e custo',
    visual: { pele: '#e8b896', cabelo: '#7a4b2a', estilo: 'curto', roupa: '#264653', calca: '#1f2233', oculos: true },
  },
  {
    id: 'eduardo', nome: 'Eduardo', cargo: 'Tech Lead', sala: 'desenvolvimento', mesa: { x: 3, y: 17 },
    papel: 'Divide as tarefas, integra e garante consistência',
    visual: { pele: '#d9a47c', cabelo: '#3b2a1f', estilo: 'curto', roupa: '#3a86ff', calca: '#2b2d42', oculos: true },
  },
  {
    id: 'fernanda', nome: 'Fernanda', cargo: 'Dev', sala: 'desenvolvimento', mesa: { x: 9, y: 17 },
    papel: 'Implementa tarefas (layout e interface)',
    visual: { pele: '#f6d2b8', cabelo: '#b83b2e', estilo: 'rabo', roupa: '#8338ec', calca: '#2b2d42' },
  },
  {
    id: 'gabriel', nome: 'Gabriel', cargo: 'Dev', sala: 'desenvolvimento', mesa: { x: 15, y: 17 },
    papel: 'Implementa tarefas (lógica da aplicação)',
    visual: { pele: '#a8714c', cabelo: '#111111', estilo: 'raspado', roupa: '#06a77d', calca: '#3d405b' },
  },
  {
    id: 'helena', nome: 'Helena', cargo: 'Dev', sala: 'desenvolvimento', mesa: { x: 21, y: 17 },
    papel: 'Implementa tarefas (dados e integrações)',
    visual: { pele: '#6b4226', cabelo: '#1a1110', estilo: 'coque', roupa: '#ffbe0b', calca: '#2b2d42' },
  },
  {
    id: 'igor', nome: 'Igor', cargo: 'QA Funcional', sala: 'testes', mesa: { x: 29, y: 17 },
    papel: 'Escreve e roda os testes automáticos',
    visual: { pele: '#f0c39e', cabelo: '#d4a017', estilo: 'curto', roupa: '#ef476f', calca: '#2b2d42' },
  },
  {
    id: 'julia', nome: 'Júlia', cargo: 'QA de Código e Segurança', sala: 'testes', mesa: { x: 35, y: 17 },
    papel: 'Revisa código, segurança e acessibilidade',
    visual: { pele: '#c98d66', cabelo: '#2b1a12', estilo: 'longo', roupa: '#118ab2', calca: '#1f2233', oculos: true },
  },
  {
    id: 'lucas', nome: 'Lucas', cargo: 'Delivery', sala: 'delivery', mesa: { x: 31, y: 3 },
    papel: 'Empacota, documenta e entrega a solução',
    visual: { pele: '#9c6644', cabelo: '#1b1b1b', estilo: 'cacheado', roupa: '#80b918', calca: '#2b2d42', fone: true },
  },
];

export const POR_ID = Object.fromEntries(AGENTES.map((a) => [a.id, a]));

export function cadeira(def) {
  return { x: def.mesa.x, y: def.mesa.y + 1 };
}
