// Planta do escritório: 5 salas + corredor numa grade de 40 x 25 tiles de 16 px.
// Em cima: Produto → Arquitetura → Delivery. Embaixo: Desenvolvimento → Testes.
// O fluxo desce da Arquitetura para o Dev, segue para Testes e sobe para o Delivery.

export const TILE = 16;
export const COLS = 40;
export const ROWS = 25;
export const LARGURA = COLS * TILE;
export const ALTURA = ROWS * TILE;

// Retângulos incluem as paredes (x0/x1/y0/y1 são linhas de parede).
// `pontos`: lugares de reunião; os dois primeiros são da dupla da sala,
// os demais servem para visitas (handoff) e reuniões maiores.
export const SALAS = {
  produto: {
    nome: 'Produto', ordem: 1, x0: 0, y0: 0, x1: 13, y1: 10,
    piso: ['#9b7752', '#906d49'], destaque: '#f4a261',
    portas: [[6, 10], [7, 10]],
    pontos: [{ x: 4, y: 7, dir: 'direita' }, { x: 7, y: 7, dir: 'esquerda' }, { x: 5, y: 8, dir: 'cima' }, { x: 6, y: 8, dir: 'cima' }],
  },
  arquitetura: {
    nome: 'Arquitetura', ordem: 2, x0: 13, y0: 0, x1: 26, y1: 10,
    piso: ['#5a7394', '#526a89'], destaque: '#7cc6fe',
    portas: [[19, 10], [20, 10]],
    pontos: [{ x: 18, y: 7, dir: 'direita' }, { x: 21, y: 7, dir: 'esquerda' }, { x: 19, y: 8, dir: 'cima' }, { x: 20, y: 8, dir: 'cima' }],
  },
  desenvolvimento: {
    nome: 'Desenvolvimento', ordem: 3, x0: 0, y0: 14, x1: 26, y1: 24,
    piso: ['#52705e', '#4a6655'], destaque: '#80ed99',
    portas: [[12, 14], [13, 14]],
    pontos: [
      { x: 10, y: 21, dir: 'direita' }, { x: 15, y: 21, dir: 'esquerda' },
      { x: 12, y: 20, dir: 'baixo' }, { x: 13, y: 20, dir: 'baixo' },
      { x: 12, y: 22, dir: 'cima' }, { x: 13, y: 22, dir: 'cima' },
    ],
  },
  testes: {
    nome: 'Testes', ordem: 4, x0: 26, y0: 14, x1: 39, y1: 24,
    piso: ['#87596a', '#7d5162'], destaque: '#ff8fab',
    portas: [[32, 14], [33, 14]],
    pontos: [{ x: 31, y: 21, dir: 'direita' }, { x: 34, y: 21, dir: 'esquerda' }, { x: 32, y: 22, dir: 'cima' }, { x: 33, y: 22, dir: 'cima' }],
  },
  delivery: {
    nome: 'Delivery', ordem: 5, x0: 26, y0: 0, x1: 39, y1: 10,
    piso: ['#7a6893', '#705f88'], destaque: '#c77dff',
    portas: [[32, 10], [33, 10]],
    pontos: [{ x: 30, y: 7, dir: 'direita' }, { x: 33, y: 7, dir: 'esquerda' }, { x: 31, y: 8, dir: 'cima' }, { x: 32, y: 8, dir: 'cima' }],
  },
};

export const CORREDOR = { y0: 10, y1: 14, piso: ['#5d6170', '#565a68'] };

// Móveis que ocupam o chão (bloqueiam passagem). Mesas têm 2 tiles de largura;
// a cadeira fica no tile logo abaixo da mesa e é onde o agente senta.
export const MOVEIS = [
  // Produto
  { tipo: 'planta', x: 1, y: 8 }, { tipo: 'planta', x: 12, y: 1 },
  { tipo: 'mesa_reuniao', x: 5, y: 7, w: 2 },
  { tipo: 'estante', x: 11, y: 7, h: 2 },
  // Arquitetura
  { tipo: 'mesa_reuniao', x: 19, y: 7, w: 2 },
  { tipo: 'planta', x: 25, y: 1 }, { tipo: 'estante', x: 14, y: 7, h: 2 },
  // Delivery
  { tipo: 'mesa_reuniao', x: 31, y: 7, w: 2 },
  { tipo: 'caixa', x: 37, y: 7 }, { tipo: 'caixa', x: 37, y: 8 }, { tipo: 'caixa', x: 36, y: 8 },
  { tipo: 'planta', x: 27, y: 1 },
  // Corredor
  { tipo: 'planta', x: 1, y: 11 }, { tipo: 'planta', x: 38, y: 11 },
  { tipo: 'bebedouro', x: 24, y: 11 }, { tipo: 'cafe', x: 16, y: 11 },
  // Desenvolvimento
  { tipo: 'mesa_reuniao', x: 11, y: 21, w: 4 },
  { tipo: 'servidor', x: 25, y: 15, h: 2 },
  { tipo: 'planta', x: 1, y: 23 }, { tipo: 'planta', x: 25, y: 23 },
  // Testes
  { tipo: 'mesa_reuniao', x: 32, y: 21, w: 2 },
  { tipo: 'planta', x: 38, y: 23 }, { tipo: 'planta', x: 27, y: 23 },
];

// Decoração presa às paredes (não bloqueia: a parede já bloqueia).
export const QUADROS = [
  { tipo: 'kanban', x: 3, y: 0, w: 4 },
  { tipo: 'lousa', x: 16, y: 0, w: 5 },
  { tipo: 'foguete', x: 35, y: 0, w: 2 },
  { tipo: 'tela_codigo', x: 5, y: 14, w: 3 },
  { tipo: 'painel_testes', x: 35, y: 14, w: 3 },
  { tipo: 'relogio', x: 9, y: 0, w: 1 },
  { tipo: 'relogio', x: 29, y: 0, w: 1 },
];

// ---------- grades ----------

function grade(valor) {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(valor));
}

export const parede = grade(false);

for (const s of Object.values(SALAS)) {
  for (let x = s.x0; x <= s.x1; x++) { parede[s.y0][x] = true; parede[s.y1][x] = true; }
  for (let y = s.y0; y <= s.y1; y++) { parede[y][s.x0] = true; parede[y][s.x1] = true; }
}
for (let y = CORREDOR.y0; y <= CORREDOR.y1; y++) { parede[y][0] = true; parede[y][COLS - 1] = true; }
for (const s of Object.values(SALAS)) for (const [x, y] of s.portas) parede[y][x] = false;

export function ehPorta(x, y) {
  return Object.values(SALAS).some((s) => s.portas.some(([px, py]) => px === x && py === y));
}

// Mesas de trabalho vêm dos agentes (cada um tem a sua); registradas por motor.js.
export const bloqueio = grade(false);
for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) bloqueio[y][x] = parede[y][x];

export function bloquear(x, y, w = 1, h = 1) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) bloqueio[y + j][x + i] = true;
}
for (const m of MOVEIS) bloquear(m.x, m.y, m.w ?? 1, m.h ?? 1);

export function salaDoTile(x, y) {
  for (const [id, s] of Object.entries(SALAS)) {
    if (x > s.x0 && x < s.x1 && y > s.y0 && y < s.y1) return id;
  }
  return null;
}

// Tiles livres dentro de uma sala (para os passeios de quem está ocioso).
export function tilesLivres(salaId) {
  const s = SALAS[salaId];
  const livres = [];
  for (let y = s.y0 + 1; y < s.y1; y++) for (let x = s.x0 + 1; x < s.x1; x++) if (!bloqueio[y][x]) livres.push({ x, y });
  return livres;
}

// Busca em largura na grade (4 vizinhos). Devolve a lista de tiles até o alvo, sem o ponto de partida.
export function caminho(de, ate) {
  if (de.x === ate.x && de.y === ate.y) return [];
  const chave = (x, y) => y * COLS + x;
  const veio = new Map([[chave(de.x, de.y), null]]);
  const fila = [de];
  const passos = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (fila.length) {
    const atual = fila.shift();
    if (atual.x === ate.x && atual.y === ate.y) break;
    for (const [dx, dy] of passos) {
      const nx = atual.x + dx;
      const ny = atual.y + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      const k = chave(nx, ny);
      if (veio.has(k)) continue;
      // O destino pode estar "bloqueado" só se for o próprio alvo (ex.: cadeira).
      if (bloqueio[ny][nx] && !(nx === ate.x && ny === ate.y)) continue;
      veio.set(k, atual);
      fila.push({ x: nx, y: ny });
    }
  }
  if (!veio.has(chave(ate.x, ate.y))) return null;
  const rota = [];
  for (let p = ate; p && !(p.x === de.x && p.y === de.y); p = veio.get(chave(p.x, p.y))) rota.unshift(p);
  return rota;
}
