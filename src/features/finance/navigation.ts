import {
  ArrowLeftRight,
  ChartNoAxesCombined,
  CreditCard,
  LayoutDashboard,
  Tags,
  Users,
  Wallet,
} from "lucide-react";

// `slug` es el valor de ?tab= en la URL; Resumen es la vista sin parámetro.
export const tabs = [
  {
    name: "Resumen",
    slug: "",
    icon: LayoutDashboard,
    text: "Consultá tu saldo mensual, ingresos y gastos.",
  },
  {
    name: "Movimientos",
    slug: "movimientos",
    icon: ArrowLeftRight,
    text: "Registrá tus ingresos y gastos con fecha, categoría, moneda y notas.",
  },
  {
    name: "Presupuestos",
    slug: "presupuestos",
    icon: Wallet,
    text: "Establecé un límite mensual para cada categoría.",
  },
  {
    name: "Medios de pago",
    slug: "medios",
    icon: CreditCard,
    text: "Efectivo, billeteras y tarjetas: cuánto gastaste con cada uno y qué cuotas vienen. Todo cargado a mano.",
  },
  {
    name: "Ver gastos",
    slug: "anual",
    icon: ChartNoAxesCombined,
    text: "Una mirada amplia a tu año, mes a mes.",
  },
  {
    name: "Categorías",
    slug: "categorias",
    icon: Tags,
    text: "Organizá tus ingresos y gastos con categorías personalizadas.",
  },
  {
    name: "Grupo Familiar",
    slug: "familia",
    icon: Users,
    text: "Compartí tus finanzas con tu familia y administrá tu cuenta.",
  },
] as const;
export type Tab = (typeof tabs)[number]["name"];

export function tabFromLocation(): Tab {
  const slug = new URLSearchParams(window.location.search).get("tab") ?? "";
  return tabs.find((t) => t.slug === slug)?.name ?? "Resumen";
}
export function tabUrl(tab: Tab) {
  const url = new URL(window.location.href);
  const slug = tabs.find((t) => t.name === tab)!.slug;
  if (slug) url.searchParams.set("tab", slug);
  else url.searchParams.delete("tab");
  return url;
}
