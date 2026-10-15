import { ArrowDownLeft, ArrowUpRight, ChevronRight, Wallet } from "lucide-react";
import Decimal from "decimal.js";
import { Empty } from "@/components/ui";
import { BudgetProgress } from "@/features/budgets/budget-progress";
import { MovementList } from "@/features/movements/movement-list";
import {
  type Budget,
  type Category,
  type Currency,
  type Movement,
  type PaymentMethod,
  byRecent,
  money,
  monthName,
  shiftMonth,
  sum,
  totals,
  variation,
} from "../finance/model";
import { Distribution, Evolution, Summary } from "./charts";

function trend(current: Decimal, previous: Decimal, label: string) {
  const change = variation(current, previous);
  if (change === null) return `Sin datos de ${label} para comparar`;
  if (change === 0) return `Igual que en ${label}`;
  return `${change > 0 ? "▲" : "▼"} ${Math.abs(change)}% vs. ${label}`;
}

export function SummaryTab({
  rows,
  categories,
  budgets,
  currency,
  month,
  methods,
  authorName,
  open,
  create,
  createBudget,
  seeMovements,
  seeBudgets,
}: {
  // Todo lo cargado: el mes elegido y el anterior salen de acá.
  rows: Movement[];
  categories: Category[];
  // Presupuestos del mes y la moneda elegidos.
  budgets: Budget[];
  currency: Currency;
  month: string;
  methods: PaymentMethod[];
  authorName: (id: string) => string;
  open: (item: Movement) => void;
  create: () => void;
  createBudget: () => void;
  seeMovements: () => void;
  seeBudgets: () => void;
}) {
  const selected = rows.filter(
    (r) => r.date.startsWith(month) && r.currency === currency.code,
  );
  const summary = totals(selected, currency.code);
  const previous = totals(rows, currency.code, shiftMonth(month, -1));
  const before = monthName(shiftMonth(month, -1)).toLowerCase();
  const spent = (categoryId: string) =>
    sum(
      selected.filter((r) => r.category_id === categoryId),
      "expense",
    );
  const distribution = categories
    .filter((c) => c.kind === "expense")
    .map((c) => ({ ...c, total: spent(c.id) }))
    .filter((c) => c.total.gt(0))
    .sort((a, b) => b.total.comparedTo(a.total));
  // Primero los presupuestos más comprometidos.
  const tracked = budgets
    .map((b) => ({ budget: b, spent: spent(b.category_id) }))
    .sort((a, b) =>
      b.spent.div(b.budget.amount).comparedTo(a.spent.div(a.budget.amount)),
    );
  const latest = [...selected].sort(byRecent).slice(0, 5);
  return (
    <>
      <div className="summary-grid">
        <Summary
          label="Saldo del mes"
          value={money(summary.balance, currency)}
          dark
          icon={<Wallet size={19} />}
          foot="Ingresos menos gastos"
          trend={trend(summary.balance, previous.balance, before)}
        />
        <Summary
          label="Ingresos"
          value={money(summary.income, currency)}
          icon={<ArrowDownLeft size={19} />}
          foot={`${selected.filter((r) => r.kind === "income").length} ingresos este mes`}
          trend={trend(summary.income, previous.income, before)}
        />
        <Summary
          label="Gastos"
          value={money(summary.expense, currency)}
          icon={<ArrowUpRight size={19} />}
          foot={`${selected.filter((r) => r.kind === "expense").length} gastos este mes`}
          trend={trend(summary.expense, previous.expense, before)}
        />
      </div>
      <div className="chart-grid">
        <section className="card">
          <div className="section-heading">
            <div>
              <h2>El ritmo de tu mes</h2>
              <p>
                Ingresos y gastos por día · {month} · {currency.code}
              </p>
            </div>
            <span className="badge">Diario</span>
          </div>
          <Evolution
            rows={rows}
            currency={currency}
            year={month.slice(0, 4)}
            month={month}
          />
        </section>
        <section className="card">
          <div className="section-heading">
            <div>
              <h2>¿En qué se fue?</h2>
              <p>Gastos por categoría</p>
            </div>
            <span className="badge">{currency.code}</span>
          </div>
          {distribution.length ? (
            <Distribution
              items={distribution}
              currency={currency}
              total={summary.expense}
            />
          ) : (
            <Empty
              title="Tu mapa de gastos, acá"
              text="Cuando registres gastos, vas a ver cómo se distribuyen."
            />
          )}
        </section>
      </div>
      <div className="chart-grid">
        <section className="card">
          <div className="section-heading">
            <div>
              <h2>Últimos movimientos</h2>
              <p>Los detalles hacen la diferencia</p>
            </div>
            <button className="text-button" onClick={seeMovements}>
              Ver todos <ChevronRight size={15} />
            </button>
          </div>
          {latest.length ? (
            <MovementList
              rows={latest}
              categories={categories}
              currency={currency}
              authorName={authorName}
              open={open}
              methods={methods}
            />
          ) : (
            <Empty
              title="Todavía no hay movimientos"
              text="Registrá tu primer ingreso o gasto para empezar a ver tus números."
              action={create}
            />
          )}
        </section>
        <section className="card">
          <div className="section-heading">
            <div>
              <h2>Tus presupuestos</h2>
              <p>Un plan para este mes</p>
            </div>
            <button className="text-button" onClick={seeBudgets}>
              Ver todos <ChevronRight size={15} />
            </button>
          </div>
          {tracked.length ? (
            tracked
              .slice(0, 4)
              .map(({ budget, spent }) => (
                <BudgetProgress
                  key={budget.id}
                  budget={budget}
                  category={categories.find((c) => c.id === budget.category_id)}
                  spent={spent}
                  currency={currency}
                />
              ))
          ) : (
            <Empty
              title="Poné tus objetivos en marcha"
              text="Creá un presupuesto y seguí tus gastos sin perder de vista tu plan."
              action={createBudget}
              actionLabel="Crear presupuesto"
            />
          )}
        </section>
      </div>
    </>
  );
}
