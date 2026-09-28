export function GET() {
  return Response.json(
    {
      id: "/gasto",
      name: "Agregar gasto · Clara",
      short_name: "Agregar gasto",
      start_url: "/gasto",
      scope: "/",
      display: "standalone",
      background_color: "#f7f8fa",
      theme_color: "#176b51",
      lang: "es-AR",
      icons: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        {
          src: "/icons/icon-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json" } },
  );
}
