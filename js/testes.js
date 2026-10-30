// Sala de Testes no navegador: monta a prévia do app (service worker sw-previa.js),
// abre num iframe do mesmo site, executa os testes do Igor passo a passo e devolve
// o resultado. O app roda logado com a sessão do escritório (mesmo projeto Supabase),
// copiada para a chave de sessão do próprio app e restaurada no fim.

const CACHE = 'squad-previa';
const ESPERA = 8000;
const TIPOS = {
  html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json',
  svg: 'image/svg+xml', md: 'text/markdown', txt: 'text/plain', webmanifest: 'application/manifest+json',
};

// Vai no topo de cada HTML da prévia: guarda erros do app e responde confirm/alert sozinho.
const INSTRUMENTO = `<script>(function(){var q=window.__qa={erros:[]};function add(m){q.erros.push(String(m).slice(0,300))}
addEventListener('error',function(e){var t=e.target;if(t&&t!==window&&(t.src||t.href)){add('Falha ao carregar '+(t.src||t.href))}else{add((e.message||'Erro')+(e.filename?' ('+e.filename.split('/').pop()+':'+e.lineno+')':''))}},true);
addEventListener('unhandledrejection',function(e){var r=e.reason;add('Promise rejeitada: '+(r&&r.message||r))});
var ce=console.error;console.error=function(){add([].map.call(arguments,function(a){return a&&a.message||String(a)}).join(' '));ce.apply(console,arguments)};
window.confirm=function(){return true};window.alert=function(){};window.prompt=function(m,d){return d||''};})();</script>`;

const normalizar = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

function instrumentar(html) {
  const m = html.match(/<head[^>]*>/i);
  return m ? html.replace(m[0], `${m[0]}\n${INSTRUMENTO}`) : INSTRUMENTO + html;
}

class FalhaTeste extends Error {}

export class SalaTestes {
  constructor({ nuvem, iframe }) {
    this.nuvem = nuvem;
    this.iframe = iframe;
    this.cancelado = false;
    this.faltando = [];
    navigator.serviceWorker?.addEventListener('message', (e) => {
      if (e.data?.tipo === 'previa-404') this.faltando.push(e.data.caminho);
    });
  }

  static suportado() {
    return 'serviceWorker' in navigator && 'caches' in window && window.isSecureContext;
  }

  // Grava os arquivos do app no cache que o service worker serve.
  async montarPrevia(projetoId) {
    await navigator.serviceWorker.register('./sw-previa.js', { scope: './' });
    await navigator.serviceWorker.ready;
    this.base = new URL(`./previa/${projetoId}/`, location.href);
    const arquivos = await this.nuvem.arquivosDaEntrega(projetoId);
    await caches.delete(CACHE);
    const cache = await caches.open(CACHE);
    const htmls = [];
    for (const [caminho, conteudo] of arquivos) {
      if (caminho.startsWith('docs/')) continue;
      const ext = caminho.split('.').pop().toLowerCase();
      const corpo = ext === 'html' ? instrumentar(conteudo) : conteudo;
      if (ext === 'html' && !caminho.includes('/')) htmls.push(caminho);
      await cache.put(new URL(caminho, this.base).href, new Response(corpo, {
        headers: { 'Content-Type': `${TIPOS[ext] ?? 'text/plain'}; charset=utf-8`, 'Cache-Control': 'no-store' },
      }));
    }
    return htmls;
  }

  // Sessão do escritório copiada para a chave do app ('<prefixo>auth', regra técnica do squad).
  async prepararSessao(prefixo) {
    this.chaveApp = prefixo ? `${prefixo}auth` : null;
    this.sessaoApp = await this.nuvem.sessaoBruta();
    this.anterior = this.chaveApp ? localStorage.getItem(this.chaveApp) : null;
  }

  definirLogin(logado) {
    if (!this.chaveApp) return;
    if (logado && this.sessaoApp) localStorage.setItem(this.chaveApp, this.sessaoApp);
    else localStorage.removeItem(this.chaveApp);
  }

  restaurarSessao() {
    if (!this.chaveApp) return;
    if (this.anterior == null) localStorage.removeItem(this.chaveApp);
    else localStorage.setItem(this.chaveApp, this.anterior);
  }

  // ---------- passos ----------

  get doc() { return this.iframe.contentDocument; }
  get win() { return this.iframe.contentWindow; }

  async esperar(cond, ms, descricao) {
    const fim = Date.now() + ms;
    for (;;) {
      if (this.cancelado) throw new FalhaTeste('Testes cancelados.');
      let r = null;
      try { r = cond(); } catch (e) { if (e instanceof FalhaTeste) throw e; }
      if (r) return r;
      if (Date.now() > fim) throw new FalhaTeste(descricao);
      await dormir(120);
    }
  }

  visivel(el) {
    if (!el || !el.isConnected) return false;
    const st = this.win.getComputedStyle(el);
    return el.getClientRects().length > 0 && st.visibility !== 'hidden' && st.display !== 'none';
  }

  achar(alvo) {
    const a = String(alvo ?? '').trim();
    if (a.toLowerCase().startsWith('texto:')) {
      const quer = normalizar(a.slice(6));
      const cands = [...this.doc.querySelectorAll('button, a, label, summary, [role="button"], [role="tab"], [role="link"], input[type="submit"], input[type="button"]')]
        .filter((el) => this.visivel(el));
      const texto = (el) => normalizar(el.value && el.tagName === 'INPUT' ? el.value : el.textContent || el.getAttribute('aria-label'));
      return cands.find((el) => texto(el) === quer) ?? cands.find((el) => texto(el).includes(quer)) ?? null;
    }
    try {
      return [...this.doc.querySelectorAll(a)].find((el) => this.visivel(el)) ?? this.doc.querySelector(a);
    } catch {
      throw new FalhaTeste(`Seletor inválido: ${a}`);
    }
  }

  async elemento(alvo, ms = ESPERA) {
    return this.esperar(() => { const el = this.achar(alvo); return this.visivel(el) ? el : null; }, ms, `Não encontrei "${alvo}" visível na tela.`);
  }

  textoTela(alvo) {
    const raiz = alvo ? this.achar(alvo) : this.doc.body;
    return normalizar(raiz?.innerText ?? '');
  }

  async abrir(caminho, logado) {
    this.definirLogin(logado);
    this.n = (this.n ?? 0) + 1;
    const [arquivo, hash] = String(caminho || 'index.html').replace(/^\.?\//, '').split('#');
    const url = new URL(arquivo || 'index.html', this.base);
    url.searchParams.set('qa', String(this.n)); // força recarregar mesmo com o mesmo arquivo
    if (hash) url.hash = hash;
    const carregou = new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new FalhaTeste(`A página ${arquivo} não carregou em 15 segundos.`)), 15000);
      this.iframe.addEventListener('load', () => { clearTimeout(t); resolve(); }, { once: true });
    });
    this.iframe.src = url.href;
    await carregou;
    await dormir(900); // módulos e primeira renderização
  }

  async executarPasso(p) {
    const valor = String(p.valor ?? '');
    switch (p.acao) {
      case 'abrir': return this.abrir(p.alvo, true);
      case 'abrir_sem_login': return this.abrir(p.alvo, false);
      case 'clicar': {
        const el = await this.elemento(p.alvo);
        el.scrollIntoView?.({ block: 'center' });
        el.click();
        return dormir(350);
      }
      case 'preencher': {
        const el = await this.elemento(p.alvo);
        el.focus();
        const proto = el.tagName === 'TEXTAREA' ? this.win.HTMLTextAreaElement.prototype : this.win.HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (setter && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) setter.call(el, valor); else el.value = valor;
        el.dispatchEvent(new this.win.Event('input', { bubbles: true }));
        el.dispatchEvent(new this.win.Event('change', { bubbles: true }));
        return dormir(80);
      }
      case 'selecionar': {
        const el = await this.elemento(p.alvo);
        const opcao = [...el.options].find((o) => o.value === valor) ?? [...el.options].find((o) => normalizar(o.textContent) === normalizar(valor));
        if (!opcao) throw new FalhaTeste(`A opção "${valor}" não existe em ${p.alvo}.`);
        el.value = opcao.value;
        el.dispatchEvent(new this.win.Event('change', { bubbles: true }));
        return dormir(150);
      }
      case 'marcar': {
        const el = await this.elemento(p.alvo);
        if (!el.checked) el.click();
        return dormir(150);
      }
      case 'esperar_texto':
        return this.esperar(() => this.textoTela(p.alvo).includes(normalizar(valor)), ESPERA, `O texto "${valor}" não apareceu na tela.`);
      case 'esperar_elemento':
        return this.elemento(p.alvo);
      case 'ausente_texto':
        await dormir(600);
        if (this.textoTela(p.alvo).includes(normalizar(valor))) throw new FalhaTeste(`O texto "${valor}" não deveria aparecer na tela.`);
        return undefined;
      case 'aguardar':
        return dormir(Math.min(Number(valor) || 500, 3000));
      default:
        throw new FalhaTeste(`Ação desconhecida: ${p.acao}`);
    }
  }

  errosNovos(desde) {
    return (this.win?.__qa?.erros ?? []).slice(desde);
  }

  async executarTeste(t, marcador) {
    const inicio = performance.now();
    const troca = (s) => String(s ?? '').replaceAll('{{qa}}', marcador);
    const consoleTeste = [];
    let errosVistos = 0;
    let passo = 0;
    try {
      for (const [i, bruto] of t.passos.entries()) {
        passo = i + 1;
        const p = { ...bruto, alvo: troca(bruto.alvo), valor: troca(bruto.valor) };
        if (p.acao.startsWith('abrir')) errosVistos = 0;
        await this.executarPasso(p);
        const novos = this.errosNovos(errosVistos);
        errosVistos += novos.length;
        consoleTeste.push(...novos);
        if (novos.length) throw new FalhaTeste(`Erro no app: ${novos[0]}`);
      }
      return { id: t.id, nome: t.nome, ok: true, ms: Math.round(performance.now() - inicio) };
    } catch (e) {
      const tela = (() => { try { return this.doc?.body?.innerText?.slice(0, 1500) ?? ''; } catch { return ''; } })();
      const faltando = this.faltando.length ? ` Arquivos que faltam na prévia: ${[...new Set(this.faltando)].join(', ')}.` : '';
      return {
        id: t.id, nome: t.nome, ok: false, passo, erro: `${e instanceof FalhaTeste ? e.message : `Falha inesperada: ${e.message}`}${faltando}`.slice(0, 400),
        console: [...consoleTeste, ...this.errosNovos(errosVistos)].slice(0, 8), tela, ms: Math.round(performance.now() - inicio),
      };
    }
  }

  // Roda tudo. aoProgresso(i, total, teste, resultado|null) atualiza a tela.
  async rodar({ projetoId, prefixo, testes }, aoProgresso) {
    this.cancelado = false;
    this.faltando = [];
    const htmls = await this.montarPrevia(projetoId);
    await this.prepararSessao(prefixo);
    const carga = htmls.map((h, i) => ({ id: `C${i + 1}`, nome: `${h} carrega sem erros`, criterio: 'Carregamento', passos: [{ acao: 'abrir', alvo: h, valor: '' }, { acao: 'aguardar', alvo: '', valor: '1500' }] }));
    const todos = [...carga, ...testes];
    const marcador = `QA${Date.now().toString(36).slice(-5)}`;
    const resultados = [];
    try {
      for (const [i, t] of todos.entries()) {
        if (this.cancelado) break;
        aoProgresso?.(i, todos.length, t, null);
        this.faltando = [];
        const r = await this.executarTeste(t, marcador);
        resultados.push(r);
        aoProgresso?.(i, todos.length, t, r);
      }
    } finally {
      this.restaurarSessao();
      this.iframe.src = 'about:blank';
    }
    return resultados;
  }
}
