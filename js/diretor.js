// Diretor: toca a fila de eventos do escritório em ordem, transformando cada
// evento semântico (fala, estado, handoff, portão...) em movimento, balão e painel.
// Os eventos têm o mesmo formato de squad_eventos: { tipo, agente, para, sala, texto, dados }.
// A esteira só diz o que aconteceu; a coreografia (andar até a mesa de reunião,
// virar para quem fala, levar o documento) é decidida aqui.

import { POR_ID, cadeira } from './agentes.js';
import { SALAS } from './mapa.js';

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

export class Diretor {
  constructor(motor, ui) {
    this.motor = motor;
    this.ui = ui;
    this.fila = [];
    this.tocando = false;
    this.geracao = 0;
    this.velocidade = 1;
  }

  definirVelocidade(v) {
    this.velocidade = v;
    this.motor.velocidade = v;
  }

  enfileirar(...eventos) {
    this.fila.push(...eventos);
    if (!this.tocando) this.tocar();
  }

  cancelar() {
    this.geracao++;
    this.fila = [];
    this.tocando = false;
  }

  async tocar() {
    this.tocando = true;
    const minha = this.geracao;
    while (this.fila.length && minha === this.geracao) {
      const ev = this.fila.shift();
      try {
        await this.aplicar(ev, minha);
      } catch (e) {
        console.error('evento falhou', ev, e);
      }
    }
    if (minha === this.geracao) this.tocando = false;
  }

  // Histórico de um projeto reaberto: só painel e trilha, sem animação nem portões.
  aplicarInstantaneo(ev) {
    const d = ev.dados ?? {};
    const quando = ev.criado_em;
    switch (ev.tipo) {
      case 'fase':
        this.motor.salaAtiva = ev.sala;
        this.ui.definirFase(ev.sala);
        if (ev.texto) this.ui.registrarSistema(ev.texto, { quando });
        break;
      case 'sistema':
        this.ui.registrarSistema(ev.texto, { quando, erro: d.erro });
        break;
      case 'fala':
        this.ui.registrarFala(ev, quando);
        break;
      case 'handoff':
        this.ui.registrarFala({ ...ev, tipo: 'fala' }, quando);
        break;
      case 'artefato':
        this.ui.registrarArtefato(d, quando);
        break;
      case 'fim':
        this.ui.registrarSistema(ev.texto ?? 'Projeto concluído', { quando });
        break;
      default:
        break; // estado, reunir e portões já decididos não deixam rastro no painel
    }
  }

  pausa(ms) {
    return esperar(ms / this.velocidade);
  }

  tempoDeLeitura(texto) {
    return Math.max(1600, Math.min(6500, 1100 + String(texto ?? '').length * 32));
  }

  async aplicar(ev, geracao) {
    const d = ev.dados ?? {};
    if (d.painel) this.motor.estadoTestes = d.painel;
    switch (ev.tipo) {
      case 'fase':
        this.motor.salaAtiva = ev.sala ?? d.fase;
        this.ui.definirFase(ev.sala ?? d.fase, d);
        if (ev.texto) this.ui.registrarSistema(ev.texto);
        await this.pausa(500);
        break;

      case 'sistema':
        this.ui.registrarSistema(ev.texto, { erro: d.erro });
        await this.pausa(700);
        break;

      case 'estado':
        await this.estado(d.agentes ?? [ev.agente], d.estado);
        break;

      case 'reunir':
        await this.reunir(d.agentes ?? [ev.agente, ev.para]);
        break;

      case 'fala':
        await this.fala(ev);
        break;

      case 'handoff':
        await this.handoff(ev);
        break;

      case 'artefato':
        this.ui.registrarArtefato(d);
        await this.pausa(400);
        break;

      case 'portao': {
        if (ev.agente) this.motor.definirEmote(ev.agente, 'aguardando');
        const decisao = await this.ui.abrirPortao(ev);
        if (geracao !== this.geracao) return;
        if (ev.agente) this.motor.definirEmote(ev.agente, null);
        if (typeof d.continuar === 'function') {
          this.fila.unshift(...d.continuar(decisao)); // demonstração
        } else if (this.aoDecidirPortao) {
          try {
            await this.aoDecidirPortao(ev, decisao); // esteira real: grava no servidor
          } catch (e) {
            this.ui.registrarSistema(`Não consegui registrar sua decisão: ${e.message}`, { erro: true });
            this.fila.unshift(ev); // reabre o portão
          }
        }
        break;
      }

      case 'fim': {
        this.ui.fim(d);
        if (d.escalado) {
          this.motor.salaAtiva = null;
          break;
        }
        const todos = [...this.motor.agentes.keys()];
        for (const id of todos) this.motor.definirEmote(id, 'comemorando');
        await this.pausa(3500);
        for (const id of todos) this.motor.definirEmote(id, null);
        this.motor.salaAtiva = null;
        break;
      }

      default:
        console.warn('tipo de evento desconhecido', ev);
    }
  }

  // ---------- coreografias ----------

  async estado(ids, estado) {
    const m = this.motor;
    await Promise.all(ids.map(async (id) => {
      if (estado === 'digitando' || estado === 'lendo' || estado === 'pensando') {
        await this.sentarNaPropriaMesa(id);
        m.definirEmote(id, null);
        m.definirAtividade(id, estado);
      } else if (estado === 'livre') {
        m.definirEmote(id, null);
        m.definirAtividade(id, null);
      } else {
        m.definirEmote(id, estado); // aguardando | erro | comemorando
      }
    }));
    await this.pausa(600);
  }

  async sentarNaPropriaMesa(id) {
    const a = this.motor.agente(id);
    const c = cadeira(a.def);
    if (a.sentado && a.tile.x === c.x && a.tile.y === c.y) return;
    await this.motor.irParaCadeira(id);
  }

  // Leva os agentes aos pontos de reunião da sala do primeiro deles e os vira uns para os outros.
  async reunir(ids) {
    const m = this.motor;
    const sala = SALAS[POR_ID[ids[0]].sala];
    const pontos = sala.pontos;
    await Promise.all(ids.map((id, i) => {
      const p = pontos[i % pontos.length];
      const a = m.agente(id);
      if (a.tile.x === p.x && a.tile.y === p.y && !a.sentado) return Promise.resolve();
      m.definirAtividade(id, null);
      return m.irPara(id, { x: p.x, y: p.y, dir: p.dir });
    }));
    for (const [i, id] of ids.entries()) {
      const p = pontos[i % pontos.length];
      m.agente(id).dir = p.dir;
    }
    await this.pausa(250);
  }

  async fala(ev) {
    const m = this.motor;
    const outro = ev.para && POR_ID[ev.para] ? ev.para : null;
    if (outro) {
      const a = m.agente(ev.agente);
      const b = m.agente(outro);
      const mesmaSala = a.def.sala === b.def.sala;
      const longe = Math.hypot(a.x - b.x, a.y - b.y) > 40 || a.sentado || b.sentado;
      if (mesmaSala && longe) await this.reunir([ev.agente, outro]);
      if (!a.sentado) m.olharPara(ev.agente, outro);
      if (!b.sentado) m.olharPara(outro, ev.agente);
    }
    const tempo = this.tempoDeLeitura(ev.texto);
    m.falar(ev.agente, ev.texto, tempo / this.velocidade + 400);
    this.ui.registrarFala(ev);
    await this.pausa(tempo);
  }

  // O agente leva o artefato até a sala de quem recebe; os dois se encontram na mesa de reunião.
  async handoff(ev) {
    const m = this.motor;
    const d = ev.dados ?? {};
    const de = ev.agente;
    const para = ev.para;
    const destino = SALAS[POR_ID[para].sala];
    const [pRecebe, pEntrega] = destino.pontos;
    const a = m.agente(de);
    m.definirAtividade(de, null);
    m.definirEmote(de, null);
    a.carregando = true;
    this.ui.registrarSistema(`${POR_ID[de].nome} leva ${d.artefato ?? 'o material'} para ${POR_ID[para].nome} (${destino.nome})`);
    await Promise.all([
      m.irPara(de, { x: pEntrega.x, y: pEntrega.y, dir: pEntrega.dir }),
      m.irPara(para, { x: pRecebe.x, y: pRecebe.y, dir: pRecebe.dir }),
    ]);
    m.olharPara(de, para);
    m.olharPara(para, de);
    const texto = ev.texto ?? `Aqui está ${d.artefato ?? 'o material'}.`;
    const tempo = this.tempoDeLeitura(texto);
    m.falar(de, texto, tempo / this.velocidade + 400);
    this.ui.registrarFala({ ...ev, tipo: 'fala', texto });
    await this.pausa(tempo);
    a.carregando = false;
    const b = m.agente(para);
    b.carregando = true;
    // quem entregou volta para a própria mesa sem segurar a fila
    m.irParaCadeira(de).then(() => m.definirAtividade(de, null));
    await this.pausa(700);
    b.carregando = false;
  }
}
