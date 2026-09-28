import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Clara · Finanzas personales",
    short_name: "Clara",
    description: "Tus finanzas, en orden",
    id: "/",
    start_url: "/gasto",
    scope: "/",
    shortcuts: [
      {
        name: "Agregar gasto",
        url: "/gasto",
        description: "Abrir directamente el formulario de gasto",
      },
      {
        name: "Ver resumen",
        url: "/panel",
        description: "Consultar las finanzas",
      },
    ],
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
  };
}
