import Decimal from "decimal.js";
Decimal.set({ precision: 40 });
export type Category = {
  id: string;
  name: string;
  color: string;
  kind: "expense" | "income";
  active: boolean;
};
export type Currency = { code: string; symbol: string; decimals: number };
export type Movement = {
  id: string;
  user_id: string;
  date: string;
  name: string;
  amount: string;
  currency: string;
  kind: "expense" | "income";
  category_id: string | null;
  note: string;
  reference?: string;
  receipt_path: string | null;
};
export type Budget = {
  id: string;
  month: string;
  category_id: string;
  currency: string;
  amount: string;
};
export const initialCurrencies: Currency[] = [
  { code: "ARS", symbol: "$", decimals: 2 },
  { code: "USD", symbol: "US$", decimals: 2 },
];
export function parseAmount(value: string, decimals = 2) {
  const normalized = value.trim().replace(",", ".");
  const pattern =
    decimals === 0 ? "^\\d{1,14}$" : `^\\d{1,14}(?:\\.\\d{1,${decimals}})?$`;
  if (!new RegExp(pattern).test(normalized) || !new Decimal(normalized).gt(0))
    throw new Error(
      `Ingresá un importe mayor a cero, sin separadores de miles y con hasta ${decimals} decimales.`,
    );
  return new Decimal(normalized).toFixed(decimals);
}
export function money(value: string | Decimal, currency: Currency) {
  const [whole, fraction] = new Decimal(value)
    .abs()
    .toFixed(currency.decimals)
    .split(".");
  return `${new Decimal(value).isNegative() ? "−" : ""}${currency.symbol} ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}${fraction ? "," + fraction : ""}`;
}
export function sum(rows: Movement[], kind?: Movement["kind"]) {
  return rows
    .filter((r) => !kind || r.kind === kind)
    .reduce((s, r) => s.plus(r.amount), new Decimal(0));
}
export function totals(rows: Movement[], currency: string, month?: string) {
  const selected = rows.filter(
    (r) => r.currency === currency && (!month || r.date.startsWith(month)),
  );
  const expense = sum(selected, "expense");
  const income = sum(selected, "income");
  return { expense, income, balance: income.minus(expense) };
}
export const months = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
