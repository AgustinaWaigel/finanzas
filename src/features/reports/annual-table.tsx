"use client";
import { useMemo } from "react";
import Decimal from "decimal.js";
import {
  type Category,
  type Currency,
  type Movement,
  money,
  months,
} from "../finance/model";

// Una sola pasada por los movimientos arma todas las celdas de la tabla.
export function AnnualTable({
  rows,
  categories,
  currency,
  year,
}: {
  rows: Movement[];
  // Categorías de gasto, una por columna.
  categories: Category[];
  currency: Currency;
  year: string;
}) {
  const cells = useMemo(() => {
    const totals = new Map<string, Decimal>();
    const add = (key: string, amount: string) =>
      totals.set(key, (totals.get(key) ?? new Decimal(0)).plus(amount));
    for (const r of rows) {
      if (r.currency !== currency.code || !r.date.startsWith(year + "-"))
        continue;
      const month = r.date.slice(5, 7);
      add(`${month}|${r.kind}`, r.amount);
      add(`year|${r.kind}`, r.amount);
      if (r.kind === "expense" && r.category_id) {
        add(`${month}|${r.category_id}`, r.amount);
        add(`year|${r.category_id}`, r.amount);
      }
    }
    return totals;
  }, [rows, currency.code, year]);
  const value = (period: string, key: string) =>
    cells.get(`${period}|${key}`) ?? new Decimal(0);
  const line = (period: string) => {
    const expense = value(period, "expense"),
      income = value(period, "income");
    return (
      <>
        {categories.map((c) => (
          <td key={c.id}>{money(value(period, c.id), currency)}</td>
        ))}
        <td>{money(expense, currency)}</td>
        <td className={period === "year" ? undefined : "positive"}>
          {money(income, currency)}
        </td>
        <td>{money(income.minus(expense), currency)}</td>
      </>
    );
  };
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Mes</th>
            {categories.map((c) => (
              <th key={c.id}>
                {c.name}
                {!c.active ? " (inactiva)" : ""}
              </th>
            ))}
            <th>Gastos</th>
            <th>Ingresos</th>
            <th>Saldo</th>
          </tr>
        </thead>
        <tbody>
          {months.map((name, i) => (
            <tr key={name}>
              <th>{name}</th>
              {line(String(i + 1).padStart(2, "0"))}
            </tr>
          ))}
          <tr className="total-row">
            <th>Total anual</th>
            {line("year")}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
