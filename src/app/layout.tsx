import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Clara · Tus finanzas, en orden",
  description: "Tu espacio personal para gastos, ingresos y presupuestos.",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Clara" },
  icons: { apple: "/icons/icon-192.png" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#176b51",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR">
      <body>{children}</body>
    </html>
  );
}
