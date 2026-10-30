// Pixel art própria do SquadTech, desenhada em código (sem imagens de terceiros).
// Tudo é desenhado na resolução base (1 unidade = 1 pixel da cena) e ampliado
// sem suavização pelo motor.

import { CORREDOR, COLS, ROWS, SALAS, TILE, ehPorta, parede, salaDoTile } from './mapa.js';

const OLHO = '#1b1b24';

function r(ctx, x, y, w, h, cor) {
  ctx.fillStyle = cor;
  ctx.fillRect(x, y, w, h);
}

function escurecer(hex, f = 0.75) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

// ---------- personagem ----------
// Caixa de 10 x 18 px; (ax, ay) é o ponto dos pés.
// opcoes: { dir: 'baixo'|'cima'|'esquerda'|'direita', quadro: 0..3, andando, sentado, digitando }
export function desenharAgente(ctx, ax, ay, visual, o) {
  const { pele, cabelo, estilo, roupa, calca } = visual;
  const dir = o.dir;
  const lado = dir === 'esquerda' || dir === 'direita';
  const espelho = dir === 'esquerda';
  const passo = o.andando ? o.quadro % 4 : 0;
  const pulo = o.pulando ? Math.round(Math.abs(Math.sin(o.t * 10)) * 3) : 0;
  const balanco = o.andando && (passo === 1 || passo === 3) ? 1 : 0;
  const ox = Math.round(ax) - 5;
  const oy = Math.round(ay) - 18 - balanco - pulo + (o.sentado ? 2 : 0);

  // sombra
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(Math.round(ax) - 4, Math.round(ay) - 1, 8, 2);
  ctx.fillRect(Math.round(ax) - 3, Math.round(ay), 6, 1);

  // p(): desenha relativo à caixa, espelhando na horizontal quando olha para a esquerda
  const p = (x, y, w, h, cor) => r(ctx, ox + (espelho ? 10 - x - w : x), oy + y, w, h, cor);

  // pernas
  if (!o.sentado) {
    if (lado) {
      const frente = passo === 1 ? 1 : passo === 3 ? -1 : 0;
      p(3 - frente, 14, 3, 3, escurecer(calca, 0.85));
      p(5 + frente, 14, 3, 3, calca);
      p(3 - frente, 17, 3, 1, '#202020');
      p(5 + frente, 17, 4, 1, '#2a2a2a');
    } else {
      const esq = passo === 1 ? 1 : 0;
      const dirp = passo === 3 ? 1 : 0;
      p(2, 14, 3, 3 - esq, calca);
      p(5, 14, 3, 3 - dirp, calca);
      p(2, 17 - esq, 3, 1, '#222');
      p(5, 17 - dirp, 3, 1, '#222');
    }
  } else {
    // sentado: só um pedaço da calça aparece sob o tronco
    p(2, 14, 6, 1, calca);
  }

  // tronco
  p(1, 8, 8, 6, roupa);
  p(1, 13, 8, 1, escurecer(roupa, 0.8));
  if (dir === 'baixo') p(4, 8, 2, 2, escurecer(roupa, 0.85)); // gola

  // braços
  const bracoCor = escurecer(roupa, 0.88);
  if (lado) {
    const ida = o.andando ? (passo === 1 ? -1 : passo === 3 ? 1 : 0) : 0;
    p(4 + ida, 9, 2, 4, bracoCor);
    p(4 + ida, 13, 2, 1, pele);
  } else {
    const t = o.digitando ? o.quadro % 2 : 0;
    p(0, 9, 1, 4, bracoCor);
    p(9, 9, 1, 4, bracoCor);
    p(0, 13 - t, 1, 1, pele);
    p(9, 12 + t, 1, 1, pele);
  }

  // cabeça
  p(1, 0, 8, 8, pele);
  if (dir === 'baixo') {
    p(3, 4, 1, 2, OLHO);
    p(6, 4, 1, 2, OLHO);
    p(2, 6, 1, 1, escurecer(pele, 0.9));
    p(7, 6, 1, 1, escurecer(pele, 0.9));
  } else if (lado) {
    p(7, 4, 1, 2, OLHO);
    p(8, 5, 1, 1, escurecer(pele, 0.85));
  }

  desenharCabelo(p, dir, estilo, cabelo, lado);

  if (visual.oculos) {
    if (dir === 'baixo') {
      p(2, 4, 3, 2, '#d8ecff');
      p(5, 4, 3, 2, '#d8ecff');
      p(2, 4, 6, 1, '#262626');
      p(3, 5, 1, 1, OLHO);
      p(6, 5, 1, 1, OLHO);
    } else if (lado) {
      p(6, 4, 3, 2, '#d8ecff');
      p(6, 4, 3, 1, '#262626');
      p(7, 5, 1, 1, OLHO);
      p(3, 4, 3, 1, '#262626');
    }
  }
  if (visual.fone) {
    if (dir === 'baixo' || dir === 'cima') {
      p(1, -1, 8, 1, '#3b3b3b');
      p(0, 3, 1, 3, '#2d2d2d');
      p(9, 3, 1, 3, '#2d2d2d');
      if (dir === 'baixo') p(1, 6, 1, 1, '#3b3b3b');
    } else {
      p(2, -1, 6, 1, '#3b3b3b');
      p(3, 3, 2, 3, '#2d2d2d');
    }
  }
}

function desenharCabelo(p, dir, estilo, c, lado) {
  const sombra = escurecer(c, 0.8);
  if (estilo === 'raspado') {
    if (dir === 'cima') { p(1, 0, 8, 5, c); return; }
    p(2, 0, 6, 1, c);
    p(1, 1, 8, 1, c);
    if (lado) p(1, 2, 3, 2, c);
    return;
  }
  if (estilo === 'cacheado') {
    if (dir === 'cima') {
      p(0, -1, 10, 8, c);
      p(1, -2, 8, 1, c);
      p(2, 2, 1, 1, sombra); p(6, 4, 1, 1, sombra); p(4, 1, 1, 1, sombra);
      return;
    }
    p(1, -2, 8, 1, c);
    p(0, -1, 10, 3, c);
    p(2, 0, 1, 1, sombra); p(6, 1, 1, 1, sombra);
    if (lado) { p(0, 2, 4, 5, c); p(1, 4, 1, 1, sombra); }
    else { p(0, 2, 2, 5, c); p(8, 2, 2, 5, c); }
    return;
  }

  // base comum: curto, longo, coque, rabo
  if (dir === 'cima') {
    p(1, 0, 8, 7, c);
    p(2, 0, 6, 1, sombra);
    if (estilo === 'longo') p(1, 7, 8, 4, c);
    if (estilo === 'coque') { p(3, -3, 4, 3, c); p(4, -3, 2, 1, sombra); }
    if (estilo === 'rabo') { p(4, 7, 2, 5, c); p(4, 11, 2, 1, sombra); }
    return;
  }
  p(2, 0, 6, 1, c);
  p(1, 1, 8, 2, c);
  if (lado) {
    p(1, 3, 3, 3, c);
    if (estilo === 'longo') p(1, 6, 3, 5, c);
    if (estilo === 'rabo') { p(0, 3, 1, 5, c); p(0, 7, 1, 1, sombra); }
    if (estilo === 'coque') p(0, -2, 4, 3, c);
  } else {
    p(1, 3, 1, 1, c);
    p(8, 3, 1, 1, c);
    p(3, 2, 2, 1, sombra);
    if (estilo === 'longo') { p(0, 2, 2, 9, c); p(8, 2, 2, 9, c); }
    if (estilo === 'coque') { p(3, -3, 4, 3, c); p(4, -3, 2, 1, sombra); }
    if (estilo === 'rabo') p(9, 2, 1, 5, c);
  }
}

// Retrato (cabeça) para o painel de conversa.
export function desenharRetrato(canvas, visual) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const tmp = document.createElement('canvas');
  tmp.width = 12;
  tmp.height = 12;
  const t = tmp.getContext('2d');
  desenharAgente(t, 6, 21, visual, { dir: 'baixo', quadro: 0 });
  ctx.drawImage(tmp, 0, 0, 12, 12, 0, 0, canvas.width, canvas.height);
}

// ---------- ícones sobre a cabeça ----------
export function desenharEmote(ctx, ax, ay, tipo, t) {
  const x = Math.round(ax) - 4;
  const y = Math.round(ay) - 31 + Math.round(Math.sin(t * 4) * 1);
  if (tipo === 'aguardando') {
    r(ctx, x, y, 9, 10, '#1b1b24');
    r(ctx, x + 1, y + 1, 7, 8, '#ffd23f');
    r(ctx, x + 4, y + 2, 1, 4, '#1b1b24');
    r(ctx, x + 4, y + 7, 1, 1, '#1b1b24');
  } else if (tipo === 'erro') {
    r(ctx, x, y, 9, 9, '#1b1b24');
    r(ctx, x + 1, y + 1, 7, 7, '#ef476f');
    for (let i = 0; i < 5; i++) { r(ctx, x + 2 + i, y + 2 + i, 1, 1, '#fff'); r(ctx, x + 6 - i, y + 2 + i, 1, 1, '#fff'); }
  } else if (tipo === 'lendo' || tipo === 'documento') {
    r(ctx, x + 1, y, 7, 9, '#1b1b24');
    r(ctx, x + 2, y + 1, 5, 7, '#fdfdfd');
    r(ctx, x + 3, y + 2, 3, 1, '#8a8fa3');
    r(ctx, x + 3, y + 4, 3, 1, '#8a8fa3');
    r(ctx, x + 3, y + 6, 2, 1, '#8a8fa3');
  } else if (tipo === 'pensando') {
    const n = Math.floor(t * 3) % 4;
    for (let i = 0; i < 3; i++) r(ctx, x + i * 3, y + 5, 2, 2, i < n ? '#fdfdfd' : 'rgba(255,255,255,0.3)');
  } else if (tipo === 'comemorando') {
    const c = Math.floor(t * 6) % 2 ? '#ffd23f' : '#fff3b0';
    r(ctx, x + 4, y, 1, 9, c);
    r(ctx, x, y + 4, 9, 1, c);
    r(ctx, x + 2, y + 2, 5, 5, c);
  }
}

// Documento carregado na mão durante um handoff.
export function desenharDocumentoNaMao(ctx, ax, ay, dir) {
  const x = Math.round(ax) + (dir === 'esquerda' ? -7 : 3);
  const y = Math.round(ay) - 9;
  r(ctx, x, y, 5, 6, '#1b1b24');
  r(ctx, x + 1, y + 1, 3, 4, '#fff8e1');
  r(ctx, x + 1, y + 2, 3, 1, '#c9b27c');
}

// ---------- móveis ----------

export function desenharMesaTrabalho(ctx, tx, ty, ligado, quadro, corTela) {
  const x = tx * TILE;
  const y = ty * TILE;
  // tampo e frente
  r(ctx, x, y + 4, 32, 7, '#b07d4a');
  r(ctx, x, y + 4, 32, 1, '#c89462');
  r(ctx, x, y + 11, 32, 5, '#8a5f36');
  r(ctx, x + 2, y + 16, 2, 0, '#5e3f22');
  // monitor
  r(ctx, x + 9, y - 6, 14, 10, '#23232e');
  r(ctx, x + 10, y - 5, 12, 8, ligado ? corTela : '#3a3f55');
  if (ligado) {
    // linhas de código rolando
    for (let i = 0; i < 3; i++) {
      const w = 3 + ((i * 7 + quadro) % 7);
      r(ctx, x + 11, y - 4 + i * 2, w, 1, 'rgba(255,255,255,0.75)');
    }
  }
  r(ctx, x + 15, y + 4, 2, 1, '#23232e');
  // teclado e caneca
  r(ctx, x + 11, y + 6, 10, 2, '#e9e9f0');
  r(ctx, x + 26, y + 5, 3, 3, '#f6f1e9');
  r(ctx, x + 29, y + 6, 1, 1, '#f6f1e9');
  // cadeira (atrás de quem senta)
  r(ctx, x + 11, y + 19, 10, 6, '#3d3f58');
  r(ctx, x + 11, y + 19, 10, 1, '#5a5d7d');
}

export function desenharMovel(ctx, m) {
  const x = m.x * TILE;
  const y = m.y * TILE;
  switch (m.tipo) {
    case 'planta':
      r(ctx, x + 4, y + 9, 8, 6, '#a0522d');
      r(ctx, x + 4, y + 9, 8, 1, '#c06a3f');
      r(ctx, x + 2, y + 1, 12, 9, '#2f8f46');
      r(ctx, x + 4, y - 2, 8, 4, '#3fae5a');
      r(ctx, x + 6, y + 3, 2, 2, '#57c972');
      r(ctx, x + 10, y + 6, 2, 2, '#57c972');
      break;
    case 'mesa_reuniao': {
      const w = (m.w ?? 2) * TILE;
      r(ctx, x + 1, y + 2, w - 2, 11, '#c8a77a');
      r(ctx, x + 1, y + 2, w - 2, 1, '#e0c49a');
      r(ctx, x + 1, y + 13, w - 2, 2, '#9c7d55');
      r(ctx, x + 6, y + 5, 6, 4, '#fdfdfd');
      r(ctx, x + w - 12, y + 6, 5, 3, '#fff3b0');
      break;
    }
    case 'estante': {
      const h = (m.h ?? 1) * TILE;
      r(ctx, x + 1, y - 6, 14, h + 4, '#6b4a2f');
      const cores = ['#e76f51', '#2a9d8f', '#e9c46a', '#8338ec', '#118ab2'];
      for (let prat = 0; prat < 3; prat++) {
        const py = y - 4 + prat * 9;
        r(ctx, x + 2, py + 7, 12, 1, '#4e3520');
        for (let l = 0; l < 4; l++) r(ctx, x + 3 + l * 3, py + 1, 2, 6, cores[(l + prat) % cores.length]);
      }
      break;
    }
    case 'caixa':
      r(ctx, x + 1, y + 2, 14, 12, '#c89b62');
      r(ctx, x + 1, y + 2, 14, 2, '#dcb37c');
      r(ctx, x + 7, y + 2, 2, 12, '#a87c47');
      break;
    case 'bebedouro':
      r(ctx, x + 4, y + 4, 8, 11, '#d9dde8');
      r(ctx, x + 5, y - 4, 6, 8, '#8fd3ff');
      r(ctx, x + 6, y - 3, 2, 5, '#c6ecff');
      break;
    case 'cafe':
      r(ctx, x + 2, y + 2, 12, 13, '#3a3a46');
      r(ctx, x + 3, y + 3, 10, 4, '#555566');
      r(ctx, x + 6, y + 9, 4, 4, '#f6f1e9');
      r(ctx, x + 4, y + 4, 2, 2, '#ef476f');
      break;
    case 'servidor': {
      const h = (m.h ?? 1) * TILE;
      r(ctx, x + 2, y - 6, 12, h + 4, '#20222e');
      for (let i = 0; i < 5; i++) {
        r(ctx, x + 3, y - 4 + i * 7, 10, 5, '#2e3142');
        r(ctx, x + 4, y - 3 + i * 7, 1, 1, i % 2 ? '#80ed99' : '#7cc6fe');
      }
      break;
    }
    default:
      break;
  }
}

// ---------- fundo estático (pisos, paredes, quadros) ----------

export function desenharFundo(ctx, quadros) {
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const px = x * TILE;
      const py = y * TILE;
      if (parede[y][x]) continue;
      const sala = salaDoTile(x, y);
      const piso = sala ? SALAS[sala].piso : CORREDOR.piso;
      r(ctx, px, py, TILE, TILE, piso[(x + y) % 2]);
      // rejunte suave
      r(ctx, px, py + TILE - 1, TILE, 1, 'rgba(0,0,0,0.08)');
      if (ehPorta(x, y)) {
        r(ctx, px, py, TILE, TILE, CORREDOR.piso[0]);
        r(ctx, px + 2, py + 4, 12, 8, '#3f6b5a');
      }
    }
  }
  // tapetes no centro das salas de reunião
  for (const s of Object.values(SALAS)) {
    const p = s.pontos[0];
    const q = s.pontos[1];
    r(ctx, p.x * TILE + 4, p.y * TILE - 6, (q.x - p.x + 1) * TILE - 8, TILE + 16, 'rgba(255,255,255,0.07)');
  }
  // paredes: topo escuro + face voltada para baixo quando há chão embaixo
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (!parede[y][x]) continue;
      const px = x * TILE;
      const py = y * TILE;
      const chaoAbaixo = y + 1 < ROWS && !parede[y + 1][x];
      r(ctx, px, py, TILE, TILE, '#262a3d');
      if (chaoAbaixo) {
        r(ctx, px, py + 5, TILE, 11, '#41466a');
        r(ctx, px, py + 5, TILE, 1, '#555b86');
        r(ctx, px, py + 15, TILE, 1, '#2f3350');
      } else {
        r(ctx, px, py, TILE, 1, '#30354d');
      }
    }
  }
  for (const q of quadros) desenharQuadro(ctx, q);
}

function desenharQuadro(ctx, q) {
  const x = q.x * TILE;
  const y = q.y * TILE;
  const w = q.w * TILE;
  switch (q.tipo) {
    case 'kanban': {
      r(ctx, x + 2, y + 4, w - 4, 11, '#e8e4da');
      r(ctx, x + 2, y + 4, w - 4, 1, '#5b4636');
      const notas = ['#ffd166', '#06d6a0', '#ef476f', '#7cc6fe', '#ffd166', '#c77dff'];
      for (let i = 0; i < 9; i++) r(ctx, x + 5 + (i % 3) * 18 + Math.floor(i / 3) * 4, y + 6 + (i % 2) * 4, 5, 3, notas[i % notas.length]);
      for (let c = 1; c < 3; c++) r(ctx, x + 2 + c * Math.floor((w - 4) / 3), y + 5, 1, 10, '#b7b2a6');
      break;
    }
    case 'lousa':
      r(ctx, x + 2, y + 3, w - 4, 12, '#f7f7f2');
      r(ctx, x + 2, y + 3, w - 4, 1, '#9aa0b5');
      r(ctx, x + 8, y + 6, 12, 5, '#7cc6fe');
      r(ctx, x + 30, y + 6, 12, 5, '#80ed99');
      r(ctx, x + 52, y + 6, 12, 5, '#f4a261');
      r(ctx, x + 20, y + 8, 10, 1, '#3d405b');
      r(ctx, x + 42, y + 8, 10, 1, '#3d405b');
      r(ctx, x + 14, y + 12, 50, 1, '#ef476f');
      break;
    case 'foguete':
      r(ctx, x + 4, y + 2, w - 8, 13, '#1f2340');
      r(ctx, x + 14, y + 4, 4, 7, '#fdfdfd');
      r(ctx, x + 15, y + 3, 2, 1, '#ef476f');
      r(ctx, x + 12, y + 9, 2, 2, '#ef476f');
      r(ctx, x + 18, y + 9, 2, 2, '#ef476f');
      r(ctx, x + 15, y + 11, 2, 2, '#ffd166');
      r(ctx, x + 8, y + 5, 1, 1, '#fff'); r(ctx, x + 23, y + 7, 1, 1, '#fff');
      break;
    case 'tela_codigo':
      r(ctx, x + 2, y + 3, w - 4, 12, '#14161f');
      for (let i = 0; i < 5; i++) r(ctx, x + 5 + (i % 2) * 4, y + 5 + i * 2, 10 + ((i * 9) % 20), 1, i % 3 ? '#80ed99' : '#7cc6fe');
      break;
    case 'painel_testes':
      r(ctx, x + 2, y + 3, w - 4, 12, '#14161f');
      break;
    case 'relogio':
      r(ctx, x + 4, y + 5, 8, 8, '#fdfdfd');
      r(ctx, x + 4, y + 5, 8, 1, '#3d405b');
      r(ctx, x + 7, y + 6, 1, 4, '#1b1b24');
      r(ctx, x + 7, y + 9, 3, 1, '#1b1b24');
      break;
    default:
      break;
  }
}

// Painel de testes animado: luzes refletem o último resultado.
export function desenharLuzesTestes(ctx, q, estado, t) {
  const x = q.x * TILE;
  const y = q.y * TILE;
  for (let i = 0; i < 6; i++) {
    let cor = '#3a3f55';
    if (estado === 'rodando') cor = Math.floor(t * 6 + i) % 6 === 0 ? '#ffd166' : '#3a3f55';
    else if (estado === 'ok') cor = '#80ed99';
    else if (estado === 'falha') cor = i === 4 ? '#ef476f' : '#80ed99';
    r(ctx, x + 6 + i * 6, y + 7, 4, 4, cor);
  }
}
