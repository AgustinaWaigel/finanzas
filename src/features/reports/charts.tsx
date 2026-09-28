"use client";
import { useState } from "react";
import Decimal from "decimal.js";
import {
  type Movement,
  type Currency,
  type Category,
  totals,
  months,
  money,
} from "../finance/model";
export function Summary({
  label,
  value,
  icon,
  foot,
  dark = false,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  foot: string;
  dark?: boolean;
}) {
  return (
    <section className={`summary-card ${dark ? "dark" : ""}`}>
      <div className="summary-top">
        <span>{label}</span>
        <span className="summary-icon">{icon}</span>
      </div>
      <strong className="summary-value">{value}</strong>
      <small>{foot}</small>
    </section>
  );
}

export function Evolution({
  rows,
  currency,
  year,
  month,
}: {
  rows: Movement[];
  currency: Currency;
  year: string;
  month?: string;
}) {
  const [selection, setSelection] = useState<string | null>(null);
  const data = month
    ? Array.from(
        {
          length: new Date(
            Number(month.slice(0, 4)),
            Number(month.slice(5, 7)),
            0,
          ).getDate(),
        },
        (_, i) => {
          const period = `${month}-${String(i + 1).padStart(2, "0")}`;
          return {
            period,
            name: `${i + 1} de ${months[Number(month.slice(5, 7)) - 1]}`,
            label: String(i + 1),
            ...totals(rows, currency.code, period),
          };
        },
      )
    : months.map((name, i) => {
        const period = `${year}-${String(i + 1).padStart(2, "0")}`;
        return {
          period,
          name,
          label: name.slice(0, 3),
          ...totals(rows, currency.code, period),
        };
      });
  const max = Decimal.max(1, ...data.flatMap((d) => [d.income, d.expense]));
  const selected = data.find((d) => d.period === selection);
  const hasData = data.some((d) => d.income.gt(0) || d.expense.gt(0));
  return (
    <>
      <div className="chart-legend">
        <span>
          <i className="income-dot" />
          Ingresos
        </span>
        <span>
          <i className="expense-dot" />
          Gastos
        </span>
      </div>
      <p className="chart-scale">
        Escala máxima: {money(max, currency)} · {currency.code}
      </p>
      <div className="evolution-scroll">
        <div
          className={`bar-chart interactive-chart ${month ? "daily-chart" : ""}`}
          role="group"
          aria-label={
            month
              ? `Movimientos diarios de ${month}`
              : `Movimientos mensuales de ${year}`
          }
        >
          {data.map((d) => (
            <button
              type="button"
              className={`bar-column ${selected?.period === d.period ? "chosen-bar" : ""}`}
              key={d.period}
              aria-pressed={selected?.period === d.period}
              aria-label={`${d.name}: ingresos ${money(d.income, currency)}, gastos ${money(d.expense, currency)}`}
              onClick={() => setSelection(d.period)}
            >
              <span className="bars">
                <span
                  className="income-bar"
                  style={{
                    height: `${d.income.div(max).mul(100).toNumber()}%`,
                    minHeight: d.income.gt(0) ? 2 : 0,
                  }}
                />
                <span
                  className="expense-bar"
                  style={{
                    height: `${d.expense.div(max).mul(100).toNumber()}%`,
                    minHeight: d.expense.gt(0) ? 2 : 0,
                  }}
                />
              </span>
              <small>{d.label}</small>
            </button>
          ))}
        </div>
      </div>
      {selected ? (
        <div className="chart-detail" aria-live="polite">
          <strong>{selected.name}</strong>
          <span className="chart-income">
            Ingresos: {money(selected.income, currency)}
          </span>
          <span className="chart-expense">
            Gastos: {money(selected.expense, currency)}
          </span>
          <span>Saldo: {money(selected.balance, currency)}</span>
        </div>
      ) : (
        <p className="chart-empty">
          {hasData
            ? `Tocá ${month ? "un día" : "un mes"} para ver sus importes.`
            : "Todavía no hay movimientos en este período."}
        </p>
      )}
    </>
  );
}

export function Distribution({
  items,
  total,
  currency,
}: {
  items: (Category & { total: Decimal })[];
  total: Decimal;
  currency: Currency;
}) {
  let offset = 0;
  const gradient = items
    .map((c) => {
      const start = offset;
      offset += c.total.div(total).mul(100).toNumber();
      return `${c.color} ${start}% ${offset}%`;
    })
    .join(",");
  return (
    <div className="distribution">
      <div
        className="donut"
        role="img"
        aria-label="Distribución de gastos por categoría"
        style={{ background: `conic-gradient(${gradient})` }}
      >
        <div>
          <small>Total de gastos</small>
          <strong>{money(total, currency)}</strong>
        </div>
      </div>
      <div className="distribution-list">
        {items.map((c) => (
          <div key={c.id}>
            <span>
              <i style={{ background: c.color }} />
              {c.name}
            </span>
            <strong>
              {money(c.total, currency)}{" "}
              <small>({c.total.div(total).mul(100).toFixed(0)}%)</small>
            </strong>
          </div>
        ))}
      </div>
    </div>
  );
}
