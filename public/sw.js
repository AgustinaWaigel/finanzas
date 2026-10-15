// Guarda solo la carcasa de la app: el HTML (que no contiene datos) y los archivos estáticos.
// Nunca respuestas de Supabase, movimientos ni tickets: esos pedidos van a otro origen y no se tocan.
const CACHE = "clara-shell-v1";
const SHELL = ["/", "/gasto", "/panel"];
const LOCAL = ["localhost", "127.0.0.1"].includes(self.location.hostname);
const isStatic = (url) =>
  url.origin === self.location.origin &&
  (url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/"));
const offlinePage = () =>
  new Response(
    '<html lang="es"><meta name="viewport" content="width=device-width"><title>Clara · Sin conexión</title><body style="font-family:system-ui;padding:40px"><h1>Estás sin conexión</h1><p>Conectate a internet para consultar o guardar tus finanzas.</p><a href="/">Reintentar</a></body></html>',
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
async function store(key, response) {
  if (response.ok) (await caches.open(CACHE)).put(key, response.clone());
  return response;
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => Promise.allSettled(SHELL.map((path) => cache.add(path)))),
  );
});
self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  ),
);
// La página avisa qué archivos estáticos ya cargó antes de que este worker la controlara.
self.addEventListener("message", (event) => {
  if (event.data?.type !== "cache-static") return;
  const urls = (event.data.urls || []).filter((u) => isStatic(new URL(u)));
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      for (const url of urls)
        if (!(await cache.match(url))) await cache.add(url).catch(() => {});
    }),
  );
});
// Recordatorio diario: el servidor manda título y texto; acá solo se muestra.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title || "Clara", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: "recordatorio-diario",
      data: { url: data.url || "/gasto" },
    }),
  );
});
// Tocar la notificación abre el formulario de gasto, reutilizando la app si ya está abierta.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/gasto", self.location.origin);
  if (target.origin !== self.location.origin) return;
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windows) => {
        const open = windows.find((w) => new URL(w.url).origin === target.origin);
        return open
          ? open.navigate(target.href).then((w) => (w || open).focus())
          : self.clients.openWindow(target.href);
      }),
  );
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    // Siempre la versión de la red; la copia guardada es solo para cuando no hay conexión.
    event.respondWith(
      fetch(request)
        .then((response) =>
          SHELL.includes(url.pathname) ? store(url.pathname, response) : response,
        )
        .catch(async () => (await caches.match(url.pathname)) || offlinePage()),
    );
    return;
  }
  if (!isStatic(url)) return;
  // En producción los nombres incluyen un hash del contenido y no cambian nunca.
  // En desarrollo sí cambian, así que ahí se prefiere la red.
  event.respondWith(
    LOCAL
      ? fetch(request)
          .then((response) => store(request, response))
          .catch(async () => (await caches.match(request)) || Response.error())
      : caches
          .match(request)
          .then((hit) => hit || fetch(request).then((r) => store(request, r))),
  );
});
