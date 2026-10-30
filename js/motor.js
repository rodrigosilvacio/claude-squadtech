// Motor do escritório: estado dos agentes, movimento pela grade, animação e desenho.
// A cena é desenhada em 640 x 400 e ampliada sem suavização; textos (nomes,
// placas e balões) vão numa segunda passada já na resolução da tela, nítidos.

import { AGENTES, cadeira } from './agentes.js';
import { ALTURA, LARGURA, MOVEIS, QUADROS, SALAS, TILE, bloquear, caminho, tilesLivres } from './mapa.js';
import {
  desenharAgente, desenharDocumentoNaMao, desenharEmote, desenharFundo,
  desenharLuzesTestes, desenharMesaTrabalho, desenharMovel,
} from './sprites.js';

const VELOCIDADE_BASE = 52; // px por segundo
const OCIOSO_PARA_PASSEAR = 14_000;

const pes = (tx, ty) => ({ x: tx * TILE + 8, y: ty * TILE + 14 });

export class Motor {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cena = document.createElement('canvas');
    this.cena.width = LARGURA;
    this.cena.height = ALTURA;
    this.cctx = this.cena.getContext('2d');
    this.fundo = document.createElement('canvas');
    this.fundo.width = LARGURA;
    this.fundo.height = ALTURA;
    desenharFundo(this.fundo.getContext('2d'), QUADROS);

    this.velocidade = 1;
    this.salaAtiva = null;
    this.estadoTestes = 'parado';
    this.t = 0;
    this.escala = 1;
    this.passeiosLigados = true;
    this.mouse = null;

    for (const a of AGENTES) bloquear(a.mesa.x, a.mesa.y, 2, 1);

    this.agentes = new Map(AGENTES.map((def) => {
      const c = cadeira(def);
      const pos = pes(c.x, c.y);
      return [def.id, {
        def,
        tile: { ...c },
        x: pos.x + 8,
        y: pos.y - 2,
        dir: 'cima',
        sentado: true,
        atividade: null, // 'digitando' | 'lendo' | 'pensando'
        emote: null, // 'aguardando' | 'erro' | 'comemorando' | 'documento'
        rota: [],
        alvoFinal: null,
        aoChegar: null,
        carregando: false,
        bolha: null,
        ultimaAcao: performance.now() - Math.random() * 10_000,
        passeando: false,
      }];
    }));

    this.redimensionar();
    new ResizeObserver(() => this.redimensionar()).observe(canvas.parentElement);
    canvas.addEventListener('mousemove', (e) => this.mover(e));
    canvas.addEventListener('mouseleave', () => { this.mouse = null; this.aoPassarMouse?.(null); });

    let anterior = performance.now();
    const quadro = (agora) => {
      const dt = Math.min(0.05, (agora - anterior) / 1000);
      anterior = agora;
      this.atualizar(dt, agora);
      this.desenhar();
      requestAnimationFrame(quadro);
    };
    requestAnimationFrame(quadro);
  }

  redimensionar() {
    const caixa = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const larguraCss = caixa.width;
    const alturaCss = larguraCss * (ALTURA / LARGURA);
    this.canvas.style.width = `${larguraCss}px`;
    this.canvas.style.height = `${alturaCss}px`;
    this.canvas.width = Math.round(larguraCss * dpr);
    this.canvas.height = Math.round(alturaCss * dpr);
    this.escala = this.canvas.width / LARGURA;
    this.dpr = dpr;
    // textos acompanham o tamanho do mapa (referência: ~1000 px de largura no desktop)
    this.fatorTexto = Math.max(0.6, Math.min(1.25, larguraCss / LARGURA / 1.55));
  }

  // ---------- comandos (usados pelo diretor) ----------

  agente(id) {
    const a = this.agentes.get(id);
    if (!a) throw new Error(`agente desconhecido: ${id}`);
    return a;
  }

  // Leva o agente até um tile. `sentar` acomoda na cadeira (centralizado na mesa de 2 tiles).
  irPara(id, alvo) {
    const a = this.agente(id);
    a.ultimaAcao = performance.now();
    a.passeando = false;
    if (a.aoChegar) { const r = a.aoChegar; a.aoChegar = null; r(); }
    const rota = caminho(a.tile, { x: alvo.x, y: alvo.y });
    return new Promise((resolve) => {
      a.alvoFinal = alvo;
      if (!rota || rota.length === 0) {
        this.acomodar(a, alvo);
        resolve();
        return;
      }
      if (a.sentado) {
        // levanta: volta para o centro do tile da cadeira antes de andar
        const p = pes(a.tile.x, a.tile.y);
        a.x = p.x;
        a.y = p.y;
      }
      a.sentado = false;
      a.atividade = null;
      a.rota = rota;
      a.aoChegar = resolve;
    });
  }

  irParaCadeira(id) {
    const a = this.agente(id);
    const c = cadeira(a.def);
    return this.irPara(id, { ...c, sentar: true, dir: 'cima' });
  }

  acomodar(a, alvo) {
    const p = pes(alvo.x, alvo.y);
    a.tile = { x: alvo.x, y: alvo.y };
    a.rota = [];
    if (alvo.sentar) {
      a.x = p.x + 8;
      a.y = p.y - 2;
      a.sentado = true;
      a.dir = 'cima';
    } else {
      a.x = p.x;
      a.y = p.y;
      a.sentado = false;
      if (alvo.dir) a.dir = alvo.dir;
    }
  }

  definirAtividade(id, atividade) {
    const a = this.agente(id);
    a.atividade = atividade;
    a.ultimaAcao = performance.now();
  }

  definirEmote(id, emote) {
    const a = this.agente(id);
    a.emote = emote;
    a.ultimaAcao = performance.now();
  }

  falar(id, texto, duracaoMs) {
    const a = this.agente(id);
    a.bolha = { texto, ate: performance.now() + duracaoMs };
    a.ultimaAcao = performance.now();
  }

  olharPara(id, outroId) {
    const a = this.agente(id);
    const b = this.agente(outroId);
    if (a.sentado) return;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    a.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'direita' : 'esquerda') : (dy > 0 ? 'baixo' : 'cima');
  }

  // Volta todos às suas mesas e limpa estados (usado em "Novo projeto").
  reiniciar() {
    this.salaAtiva = null;
    this.estadoTestes = 'parado';
    for (const a of this.agentes.values()) {
      a.emote = null;
      a.atividade = null;
      a.carregando = false;
      a.bolha = null;
      this.irParaCadeira(a.def.id);
    }
  }

  // ---------- atualização ----------

  atualizar(dt, agora) {
    this.t += dt;
    const vel = VELOCIDADE_BASE * Math.min(this.velocidade, 3);
    for (const a of this.agentes.values()) {
      if (a.bolha && agora > a.bolha.ate) a.bolha = null;
      if (a.rota.length) {
        const prox = a.rota[0];
        const destino = pes(prox.x, prox.y);
        const dx = destino.x - a.x;
        const dy = destino.y - a.y;
        const dist = Math.hypot(dx, dy);
        if (Math.abs(dx) > Math.abs(dy)) a.dir = dx > 0 ? 'direita' : 'esquerda';
        else if (dist > 0.01) a.dir = dy > 0 ? 'baixo' : 'cima';
        const passo = vel * dt;
        if (dist <= passo) {
          a.x = destino.x;
          a.y = destino.y;
          a.tile = { ...prox };
          a.rota.shift();
          if (!a.rota.length) {
            this.acomodar(a, a.alvoFinal);
            if (a.aoChegar) { const r = a.aoChegar; a.aoChegar = null; r(); }
          }
        } else {
          a.x += (dx / dist) * passo;
          a.y += (dy / dist) * passo;
        }
      } else if (this.passeiosLigados) {
        this.talvezPassear(a, agora);
      }
    }
  }

  // Quem está sem tarefa há um tempo levanta, dá uma volta na sala e retorna.
  talvezPassear(a, agora) {
    if (a.emote || a.atividade || a.carregando || a.bolha) return;
    if (agora - a.ultimaAcao < OCIOSO_PARA_PASSEAR) return;
    if (Math.random() > 0.004) return;
    if (a.passeando) {
      a.passeando = false;
      this.irParaCadeira(a.def.id).then(() => { a.ultimaAcao = performance.now(); });
      a.ultimaAcao = agora;
      return;
    }
    const livres = tilesLivres(a.def.sala);
    const alvo = { ...livres[Math.floor(Math.random() * livres.length)], dir: 'baixo' };
    // só conta como passeio se ninguém mudou o destino no meio do caminho
    this.irPara(a.def.id, alvo).then(() => { if (a.alvoFinal === alvo) a.passeando = true; });
    a.ultimaAcao = agora - OCIOSO_PARA_PASSEAR + 3000;
  }

  // ---------- desenho ----------

  desenhar() {
    const c = this.cctx;
    c.drawImage(this.fundo, 0, 0);
    const quadroAnim = Math.floor(this.t * 8);

    const painel = QUADROS.find((q) => q.tipo === 'painel_testes');
    desenharLuzesTestes(c, painel, this.estadoTestes, this.t);

    // ordem por profundidade: base (pé) de cada coisa
    const itens = [];
    for (const m of MOVEIS) itens.push({ base: (m.y + (m.h ?? 1)) * TILE, desenhar: () => desenharMovel(c, m) });
    for (const a of this.agentes.values()) {
      const def = a.def;
      const ligado = a.sentado && (a.atividade === 'digitando' || a.atividade === 'lendo');
      const corTela = a.atividade === 'lendo' ? '#f4f1de' : SALAS[def.sala].destaque;
      itens.push({ base: (def.mesa.y + 1) * TILE, desenhar: () => desenharMesaTrabalho(c, def.mesa.x, def.mesa.y, ligado, quadroAnim, corTela) });
    }
    for (const a of this.agentes.values()) {
      itens.push({
        base: a.y,
        desenhar: () => {
          desenharAgente(c, a.x, a.y, a.def.visual, {
            dir: a.dir,
            quadro: a.rota.length ? Math.floor(this.t * 9) : quadroAnim,
            andando: a.rota.length > 0,
            sentado: a.sentado,
            digitando: a.sentado && a.atividade === 'digitando',
            pulando: a.emote === 'comemorando',
            t: this.t,
          });
          if (a.carregando) desenharDocumentoNaMao(c, a.x, a.y, a.dir);
        },
      });
    }
    itens.sort((p, q) => p.base - q.base);
    for (const i of itens) i.desenhar();

    for (const a of this.agentes.values()) {
      const emote = a.emote ?? (a.atividade === 'lendo' ? 'lendo' : a.atividade === 'pensando' ? 'pensando' : null);
      if (emote) desenharEmote(c, a.x, a.y, emote, this.t);
    }

    // passada final na resolução da tela
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.cena, 0, 0, this.canvas.width, this.canvas.height);
    this.desenharCamadaTexto(ctx);
  }

  desenharCamadaTexto(ctx) {
    const e = this.escala;
    const d = this.dpr * this.fatorTexto;

    // placas das salas e destaque da sala ativa
    for (const [id, s] of Object.entries(SALAS)) {
      const ativa = id === this.salaAtiva;
      const x = (s.x0 + 1) * TILE * e;
      const y = (s.y0 + 1) * TILE * e + 2 * d;
      ctx.font = `600 ${11 * d}px "Pixelify Sans", "Inter", system-ui, sans-serif`;
      const rotulo = `${s.ordem} · ${s.nome.toUpperCase()}`;
      const w = ctx.measureText(rotulo).width + 12 * d;
      ctx.fillStyle = ativa ? s.destaque : 'rgba(20,22,34,0.72)';
      arredondado(ctx, x, y, w, 18 * d, 4 * d);
      ctx.fill();
      ctx.fillStyle = ativa ? '#15151f' : '#e9e7f5';
      ctx.textBaseline = 'middle';
      ctx.fillText(rotulo, x + 6 * d, y + 9.5 * d);
      if (ativa) {
        const pulso = 0.55 + 0.45 * Math.sin(this.t * 4);
        ctx.strokeStyle = s.destaque;
        ctx.globalAlpha = pulso;
        ctx.lineWidth = 3 * d;
        ctx.strokeRect((s.x0 + 0.5) * TILE * e, (s.y0 + 0.5) * TILE * e, (s.x1 - s.x0) * TILE * e, (s.y1 - s.y0) * TILE * e);
        ctx.globalAlpha = 1;
      }
    }

    // nomes sob os pés
    ctx.font = `600 ${9.5 * d}px "Inter", system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    for (const a of this.agentes.values()) {
      const nome = a.def.nome;
      const w = ctx.measureText(nome).width + 8 * d;
      const x = a.x * e - w / 2;
      const y = (a.y + 3) * e;
      ctx.fillStyle = this.mouse?.id === a.def.id ? 'rgba(255,255,255,0.95)' : 'rgba(15,16,26,0.7)';
      arredondado(ctx, x, y, w, 13 * d, 6 * d);
      ctx.fill();
      ctx.fillStyle = this.mouse?.id === a.def.id ? '#15151f' : '#f2f0ff';
      ctx.fillText(nome, x + 4 * d, y + 7 * d);
    }

    // balões (desenhados por último, acima de tudo)
    for (const a of this.agentes.values()) if (a.bolha) this.desenharBolha(ctx, a);
  }

  desenharBolha(ctx, a) {
    const e = this.escala;
    const d = this.dpr * this.fatorTexto;
    const larguraMax = 190 * d;
    ctx.font = `500 ${11 * d}px "Inter", system-ui, sans-serif`;
    const linhas = quebrar(ctx, a.bolha.texto, larguraMax - 16 * d).slice(0, 4);
    const alturaLinha = 14 * d;
    const w = Math.min(larguraMax, Math.max(...linhas.map((l) => ctx.measureText(l).width)) + 16 * d);
    const h = linhas.length * alturaLinha + 12 * d;
    let x = a.x * e - w / 2;
    let y = (a.y - 24) * e - h - 6 * d;
    x = Math.max(4 * d, Math.min(this.canvas.width - w - 4 * d, x));
    y = Math.max(4 * d, y);
    ctx.fillStyle = '#fffdf7';
    ctx.strokeStyle = '#15151f';
    ctx.lineWidth = 2 * d;
    arredondado(ctx, x, y, w, h, 6 * d);
    ctx.fill();
    ctx.stroke();
    // rabinho do balão
    const bx = Math.max(x + 10 * d, Math.min(x + w - 10 * d, a.x * e));
    ctx.beginPath();
    ctx.moveTo(bx - 5 * d, y + h - 1);
    ctx.lineTo(bx, y + h + 7 * d);
    ctx.lineTo(bx + 5 * d, y + h - 1);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(bx - 5 * d, y + h);
    ctx.lineTo(bx, y + h + 7 * d);
    ctx.lineTo(bx + 5 * d, y + h);
    ctx.stroke();
    ctx.fillStyle = '#15151f';
    ctx.textBaseline = 'top';
    linhas.forEach((l, i) => ctx.fillText(l, x + 8 * d, y + 6 * d + i * alturaLinha));
  }

  // ---------- mouse ----------

  mover(e) {
    const caixa = this.canvas.getBoundingClientRect();
    const mx = ((e.clientX - caixa.left) / caixa.width) * LARGURA;
    const my = ((e.clientY - caixa.top) / caixa.height) * ALTURA;
    let achado = null;
    for (const a of this.agentes.values()) {
      if (mx > a.x - 7 && mx < a.x + 7 && my > a.y - 22 && my < a.y + 6) achado = a;
    }
    this.mouse = achado ? { id: achado.def.id } : null;
    this.canvas.style.cursor = achado ? 'pointer' : 'default';
    this.aoPassarMouse?.(achado, e.clientX - caixa.left, e.clientY - caixa.top);
  }
}

function arredondado(ctx, x, y, w, h, raio) {
  ctx.beginPath();
  ctx.moveTo(x + raio, y);
  ctx.arcTo(x + w, y, x + w, y + h, raio);
  ctx.arcTo(x + w, y + h, x, y + h, raio);
  ctx.arcTo(x, y + h, x, y, raio);
  ctx.arcTo(x, y, x + w, y, raio);
  ctx.closePath();
}

function quebrar(ctx, texto, largura) {
  const palavras = String(texto).split(/\s+/);
  const linhas = [];
  let atual = '';
  for (const p of palavras) {
    const teste = atual ? `${atual} ${p}` : p;
    if (ctx.measureText(teste).width > largura && atual) {
      linhas.push(atual);
      atual = p;
    } else {
      atual = teste;
    }
  }
  if (atual) linhas.push(atual);
  return linhas;
}
