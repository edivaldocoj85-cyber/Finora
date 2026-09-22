// Service worker do app autenticado — escopo /app (registrado com caminho relativo em
// app.js, então por padrão só controla essa pasta; a landing em / fica de fora).
const CACHE = "finora-v5";
const SHELL = ["/app/", "/app/index.html", "/app/styles.css", "/app/app.js", "/app/auth-finora.css", "/app/auth-finora.js", "/app/manifest.json", "/icon.svg",
  "/app/vendor/chart.umd.min.js", "/app/vendor/marked.min.js", "/app/vendor/purify.min.js", "/app/vendor/gsap.min.js",
  "/app/vendor/supabase.min.js"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.pathname.startsWith("/api/") || url.origin !== location.origin) return;
  // rede primeiro, cache como reserva
  e.respondWith(fetch(e.request).then((r) => {
    const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r;
  }).catch(() => caches.match(e.request).then((r) => r || caches.match("/app/index.html"))));
});
