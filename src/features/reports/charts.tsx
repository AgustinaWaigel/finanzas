"use client";
import { useState } from "react";
import Decimal from "decimal.js";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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
  // Only chart geometry uses JS numbers; monetary totals and labels stay decimal.
  const chartData = data.map((d) => ({
    ...d,
    incomeHeight: d.income.div(max).mul(100).toNumber(),
    expenseHeight: d.expense.div(max).mul(100).toNumber(),
  }));
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
        <br />
        Deslizá el gráfico para recorrer todo el período.
      </p>
      <div className="evolution-scroll">
        <div
          className={`recharts-evolution ${month ? "daily-chart" : ""}`}
          role="group"
          aria-label={
            month
              ? `Movimientos diarios de ${month}`
              : `Movimientos mensuales de ${year}`
          }
        >
          <ResponsiveContainer width="100%" height={250}>
            <BarChart
              data={chartData}
              accessibilityLayer
              onClick={(state) => {
                const d =
                  state.activeTooltipIndex == null
                    ? undefined
                    : data[Number(state.activeTooltipIndex)];
                if (d) setSelection(d.period);
              }}
              margin={{ top: 12, right: 12, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                vertical={false}
                stroke="#e5ebe7"
                strokeDasharray="3 3"
              />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                interval={0}
                tick={{ fontSize: 11, fill: "#647469" }}
              />
              <YAxis hide domain={[0, 100]} />
              <Tooltip
                wrapperStyle={{ zIndex: 10 }}
                cursor={{ fill: "#176b5109" }}
                content={({ active, payload }) => {
                  const d = payload?.[0]?.payload as
                    (typeof chartData)[number] | undefined;
                  return active && d ? (
                    <div className="finance-chart-tooltip">
                      <strong>{d.name}</strong>
                      <span className="chart-income">
                        Ingresos: {money(d.income, currency)}
                      </span>
                      <span className="chart-expense">
                        Gastos: {money(d.expense, currency)}
                      </span>
                      <span>Saldo: {money(d.balance, currency)}</span>
                    </div>
                  ) : null;
                }}
              />
              <Bar
                dataKey="incomeHeight"
                name="Ingresos"
                fill="#176b51"
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
              />
              <Bar
                dataKey="expenseHeight"
                name="Gastos"
                fill="#df8770"
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <select
        aria-label={month ? "Ver detalle de un día" : "Ver detalle de un mes"}
        value={selected?.period ?? ""}
        onChange={(e) => setSelection(e.target.value)}
      >
        <option value="">{month ? "Elegí un día" : "Elegí un mes"}</option>
        {data.map((d) => (
          <option key={d.period} value={d.period}>
            {d.name}
          </option>
        ))}
      </select>
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = items.find(c => c.id === selectedId);
  const percentage = (amount: Decimal) => {
    const value = total.gt(0) ? amount.div(total).mul(100) : new Decimal(0);
    return value.gt(0) && value.lt(0.1) ? "<0,1" : value.toFixed(1).replace(".", ",");
  };
  const data = items.map((c) => ({
    ...c,
    fill: c.color,
    value: total.gt(0) ? c.total.div(total).mul(100).toNumber() : 0,
  }));
  return (
    <div className="distribution">
      <div
        className="recharts-donut"
        aria-label="Distribución de gastos por categoría"
      >
        <ResponsiveContainer width="100%" height={220}>
          <PieChart accessibilityLayer>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={78}
              outerRadius={100}
              paddingAngle={data.length > 1 ? 2 : 0}
              isAnimationActive={false}
              onClick={(_, index) => setSelectedId(items[index]?.id ?? null)}
              style={{ cursor: "pointer" }}
            />
            <Tooltip
              wrapperStyle={{ zIndex: 10 }}
              content={({ active, payload }) => {
                const d = payload?.[0]?.payload as
                  (typeof data)[number] | undefined;
                return active && d ? (
                  <div className="finance-chart-tooltip">
                    <strong>{d.name}</strong>
                    <span>
                      {money(d.total, currency)} (
                      {percentage(d.total)}%)
                    </span>
                  </div>
                ) : null;
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="recharts-donut-total">
          <small>{selected?.name ?? "Total de gastos"}</small>
          <strong>{money(selected?.total ?? total, currency)}</strong>
          <small>{selected ? `${percentage(selected.total)}% del total` : `${items.length} ${items.length === 1 ? "categoría" : "categorías"} · ${currency.code}`}</small>
        </div>
      </div>
      <p className="distribution-hint">Tocá una categoría para ver su detalle.</p>
      {selected && <button type="button" className="distribution-reset" onClick={() => setSelectedId(null)}>Ver total de gastos</button>}
      <div className="category-breakdown">
        {items.map((c) => (
          <button type="button" key={c.id} className="category-breakdown-row" aria-pressed={selected?.id === c.id} onClick={() => setSelectedId(selectedId === c.id ? null : c.id)}>
            <span className="category-breakdown-heading"><span><i style={{ background: c.color }} />{c.name}</span><span className="category-percentage">{percentage(c.total)}%</span></span>
            <strong>{money(c.total, currency)}</strong>
            <span className="category-meter" aria-hidden="true"><span style={{ background: c.color, width: `${total.gt(0) ? c.total.div(total).mul(100).toNumber() : 0}%` }} /></span>
          </button>
        ))}
      </div>
    </div>
  );
}
