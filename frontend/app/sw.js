// Service worker do app autenticado — escopo /app (registrado com caminho relativo em
// app.js, então por padrão só controla essa pasta; a landing em / fica de fora).
//
// O Cloudflare troca o no-cache da origem por max-age=14400 em todo .js, então nada aqui
// pode depender de URL sem versão: o app.js registra "sw.js?v=<hash do deploy>" (cada deploy
// instala um SW novo, que apaga os caches antigos) e só guardamos arquivos com ?v=, que nunca
// mudam de conteúdo. HTML sempre vem da rede; a cópia em cache é só pra abrir offline.
const CACHE = "finora-v11";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  if (req.mode === "navigate") {
    e.respondWith(fetch(req, { cache: "no-store" }).then((r) => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put("/app/", copy)); }
      return r;
    }).catch(() => caches.match("/app/")));
    return;
  }
  if (!url.searchParams.has("v")) return;  // sem versão: o navegador resolve, sem cache nosso
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return r;
  })));
});
