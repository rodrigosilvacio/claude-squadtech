// Service worker da Sala de Testes. Serve a prévia de um app em ./previa/<projeto>/...
// a partir do Cache Storage que o escritório preenche antes de rodar os testes.
// Só responde dentro de /previa/; o resto do site segue direto para a rede.
const CACHE = 'squad-previa';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  const base = new URL('./previa/', self.registration.scope);
  if (e.request.method !== 'GET' || url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const chave = url.origin + url.pathname; // query e hash não fazem parte do arquivo
    const r = (await cache.match(chave)) ?? (url.pathname.endsWith('/') ? await cache.match(`${chave}index.html`) : undefined);
    if (r) return r;
    for (const c of await self.clients.matchAll({ type: 'window' })) c.postMessage({ tipo: 'previa-404', caminho: url.pathname });
    return new Response('Arquivo não encontrado na prévia.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  })());
});
