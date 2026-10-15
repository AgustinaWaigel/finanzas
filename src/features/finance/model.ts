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
  created_at?: string;
  payment_method_id?: string | null;
};
// Medio de pago cargado a mano: la app no se conecta con bancos ni billeteras.
export type PaymentMethod = {
  id: string;
  name: string;
  kind: "cash" | "wallet" | "debit" | "credit" | "transfer";
  active: boolean;
  // Tarjetas de crédito: día en que cierra el resumen y día en que vence.
  closing_day?: number | null;
  due_day?: number | null;
  // Cuentas que llevan saldo: moneda, saldo inicial y desde qué día cuenta.
  currency?: string | null;
  opening_balance?: string | null;
  balance_date?: string | null;
};
// Plata que pasa de una cuenta a otra, o el pago del resumen de una tarjeta.
export type Transfer = {
  id: string;
  user_id: string;
  date: string;
  from_method_id: string;
  to_method_id: string;
  amount: string;
  note: string;
};
export const methodKinds: Record<PaymentMethod["kind"], string> = {
  cash: "Efectivo",
  wallet: "Billetera virtual",
  debit: "Tarjeta de débito",
  credit: "Tarjeta de crédito",
  transfer: "Transferencia",
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
const grouped = (text: string, separator: string) => {
  const [first, ...rest] = text.split(separator);
  return (
    rest.length > 0 &&
    /^\d{1,3}$/.test(first) &&
    rest.every((part) => /^\d{3}$/.test(part))
  );
};
// Acepta formato argentino (1.250,50), sin separadores (1250,50 o 1250.50)
// y formato con coma de miles (1,250.50). Nunca pasa por punto flotante.
export function parseAmount(value: string, decimals = 2) {
  const invalid = () =>
    new Error(
      `Ingresá un importe mayor a cero con hasta ${decimals} decimales. Ejemplo: 1.250,50.`,
    );
  let text = value.replace(/[\s$]/g, "");
  const comma = text.lastIndexOf(","),
    dot = text.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    const [decimal, thousands] = comma > dot ? [",", "."] : [".", ","];
    const parts = text.split(decimal);
    if (parts.length !== 2 || !grouped(parts[0], thousands)) throw invalid();
    text = parts[0].split(thousands).join("") + "." + parts[1];
  } else if (comma >= 0) text = text.replace(",", ".");
  // Con monedas de tres o más decimales, 1.250 es un decimal y no mil doscientos cincuenta.
  else if (decimals < 3 && grouped(text, ".")) text = text.split(".").join("");
  const pattern =
    decimals === 0 ? "^\\d{1,14}$" : `^\\d{1,14}(?:\\.\\d{1,${decimals}})?$`;
  if (!new RegExp(pattern).test(text) || !new Decimal(text).gt(0))
    throw invalid();
  return new Decimal(text).toFixed(decimals);
}
const local = (value: string | Decimal, decimals: number) => {
  const [whole, fraction] = new Decimal(value)
    .abs()
    .toFixed(decimals)
    .split(".");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}${fraction ? "," + fraction : ""}`;
};
export function money(value: string | Decimal, currency: Currency) {
  return `${new Decimal(value).isNegative() ? "−" : ""}${currency.symbol} ${local(value, currency.decimals)}`;
}
// Texto para un campo de importe: 1250.5 → 1.250,50. Si no se puede interpretar, no lo toca.
export function amountInput(value: string, decimals = 2) {
  if (!value.trim()) return "";
  try {
    return local(parseAmount(value, decimals), decimals);
  } catch {
    return value;
  }
}
// Un importe guardado (1250.50) siempre usa punto decimal, sin ambigüedad de miles.
export function storedAmountInput(value: string | undefined, decimals = 2) {
  return value ? local(value, decimals) : "";
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
const pad = (n: number) => String(n).padStart(2, "0");
// shiftMonth("2026-01", -1) → "2025-12"
export function shiftMonth(month: string, delta: number) {
  const index =
    Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + delta;
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
}
export function monthName(month: string) {
  return months[Number(month.slice(5, 7)) - 1];
}
// Suma meses conservando el día; el 31 pasa al último día de los meses más cortos.
export function addMonths(date: string, delta: number) {
  const month = shiftMonth(date.slice(0, 7), delta);
  const last = new Date(
    Number(month.slice(0, 4)),
    Number(month.slice(5, 7)),
    0,
  ).getDate();
  return `${month}-${pad(Math.min(Number(date.slice(8, 10)), last))}`;
}
// Divide un total en cuotas exactas: la última absorbe la diferencia de redondeo.
export function splitAmount(total: string, parts: number, decimals = 2) {
  const whole = new Decimal(total);
  const base = whole.div(parts).toDecimalPlaces(decimals, Decimal.ROUND_DOWN);
  if (!base.gt(0))
    throw new Error("El importe es demasiado chico para esa cantidad de cuotas.");
  return Array.from({ length: parts }, (_, i) =>
    (i === parts - 1 ? whole.minus(base.mul(parts - 1)) : base).toFixed(
      decimals,
    ),
  );
}
// Variación porcentual entera frente a un período anterior; null si no hay con qué comparar.
export function variation(current: Decimal, previous: Decimal) {
  if (previous.isZero()) return null;
  return current
    .minus(previous)
    .div(previous.abs())
    .mul(100)
    .toDecimalPlaces(0)
    .toNumber();
}
// Más nuevos primero; dentro del mismo día, el último cargado va arriba.
export function byRecent(a: Movement, b: Movement) {
  return (
    b.date.localeCompare(a.date) ||
    (b.created_at ?? "").localeCompare(a.created_at ?? "") ||
    b.id.localeCompare(a.id)
  );
}
// Saldo inicial de una cuenta: a diferencia de un importe, puede ser cero o negativo.
export function parseBalance(value: string, decimals = 2) {
  const text = value.replace(/[\s$]/g, "");
  const negative = /^[-−]/.test(text);
  const digits = text.replace(/^[-−]/, "");
  if (/^0+(?:[.,]0+)?$/.test(digits)) return new Decimal(0).toFixed(decimals);
  const amount = parseAmount(digits, decimals);
  return negative ? "-" + amount : amount;
}
const lastDay = (month: string) =>
  new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
const dayOf = (month: string, day: number) =>
  `${month}-${pad(Math.min(day, lastDay(month)))}`;
// Mes del resumen de tarjeta al que entra una compra: hasta el día de cierre va al de ese mes,
// después al siguiente. Sin día de cierre cuenta el mes calendario.
export function statementMonth(date: string, closingDay: number | null) {
  const month = date.slice(0, 7);
  if (!closingDay) return month;
  return date <= dayOf(month, closingDay) ? month : shiftMonth(month, 1);
}
// Fechas del resumen de un mes: cuándo cierra y cuándo vence (el primer día de vencimiento posterior al cierre).
export function statementDates(
  month: string,
  closingDay: number,
  dueDay: number | null,
) {
  const closes = dayOf(month, closingDay);
  if (!dueDay) return { closes, due: null };
  const sameMonth = dayOf(month, dueDay);
  return {
    closes,
    due: sameMonth > closes ? sameMonth : dayOf(shiftMonth(month, 1), dueDay),
  };
}
export const shortDate = (date: string) =>
  `${Number(date.slice(8, 10))}/${Number(date.slice(5, 7))}`;
