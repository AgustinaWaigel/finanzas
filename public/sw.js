// No se guardan respuestas autenticadas, movimientos ni tickets en caché.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate")
    event.respondWith(
      fetch(event.request).catch(
        () =>
          new Response(
            '<html lang="es"><meta name="viewport" content="width=device-width"><title>Clara · Sin conexión</title><body style="font-family:system-ui;padding:40px"><h1>Estás sin conexión</h1><p>Conectate a internet para consultar o guardar tus finanzas.</p><a href="/">Reintentar</a></body></html>',
            { headers: { "Content-Type": "text/html; charset=utf-8" } },
          ),
      ),
    );
});
