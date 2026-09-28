import { ArrowDownLeft, ArrowUpRight, Wallet } from "lucide-react";
import {
  type Movement,
  type Category,
  type Currency,
  money,
  totals,
  sum,
} from "../finance/model";
import { Summary, Evolution, Distribution } from "./charts";
import { Empty } from "@/components/ui";

export function AnnualOverview({
  rows,
  categories,
  currency,
  year,
}: {
  rows: Movement[];
  categories: Category[];
  currency: Currency;
  year: string;
}) {
  const annualRows = rows.filter(
    (r) => r.currency === currency.code && r.date.startsWith(year + "-"),
  );
  const summary = totals(annualRows, currency.code);
  const distribution = categories
    .map((c) => ({
      ...c,
      total: sum(
        annualRows.filter((r) => r.category_id === c.id),
        "expense",
      ),
    }))
    .filter((c) => c.total.gt(0))
    .sort((a, b) => b.total.comparedTo(a.total));
  return (
    <>
      <div className="summary-grid">
        <Summary
          label="Saldo del año"
          value={money(summary.balance, currency)}
          dark
          icon={<Wallet size={19} />}
          foot={`${year} · ${currency.code}`}
        />
        <Summary
          label="Ingresos del año"
          value={money(summary.income, currency)}
          icon={<ArrowDownLeft size={19} />}
          foot={`${annualRows.filter((r) => r.kind === "income").length} ingresos registrados`}
        />
        <Summary
          label="Gastos del año"
          value={money(summary.expense, currency)}
          icon={<ArrowUpRight size={19} />}
          foot={`${annualRows.filter((r) => r.kind === "expense").length} gastos registrados`}
        />
      </div>
      <div className="chart-grid">
        <section className="card">
          <div className="section-heading">
            <div>
              <h2>El ritmo de tu año</h2>
              <p>
                Ingresos y gastos por mes · {year} · {currency.code}
              </p>
            </div>
            <span className="badge">Mensual</span>
          </div>
          <Evolution rows={rows} currency={currency} year={year} />
        </section>
        <section className="card">
          <div className="section-heading">
            <div>
              <h2>Gastos del año por categoría</h2>
              <p>Los colores corresponden a tus categorías</p>
            </div>
            <span className="badge">{currency.code}</span>
          </div>
          {distribution.length ? (
            <Distribution
              items={distribution}
              total={summary.expense}
              currency={currency}
            />
          ) : (
            <Empty
              title="Tu año empieza acá"
              text="Registrá gastos para ver la distribución anual por categoría."
            />
          )}
        </section>
      </div>
    </>
  );
}
