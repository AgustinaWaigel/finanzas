import { Copy, Pencil, Trash2 } from "lucide-react";
import Decimal from "decimal.js";
import { Empty } from "@/components/ui";
import {
  type Budget,
  type Category,
  type Currency,
  monthName,
} from "../finance/model";
import { BudgetProgress } from "./budget-progress";

export function BudgetsTab({
  budgets,
  categories,
  currency,
  spent,
  previousMonth,
  copyable,
  busy,
  copy,
  create,
  edit,
  remove,
}: {
  // Presupuestos del mes y la moneda elegidos.
  budgets: Budget[];
  categories: Category[];
  currency: Currency;
  spent: (categoryId: string) => Decimal;
  previousMonth: string;
  // Cuántos presupuestos del mes anterior faltan en este.
  copyable: number;
  busy: boolean;
  copy: () => void;
  create: () => void;
  edit: (item: Budget) => void;
  remove: (item: Budget) => void;
}) {
  const copyButton = copyable > 0 && (
    <button className="text-button" disabled={busy} onClick={copy}>
      <Copy size={15} />
      {budgets.length
        ? `Sumar ${copyable} de ${monthName(previousMonth).toLowerCase()}`
        : `Copiar los ${copyable === 1 ? "" : copyable + " "}de ${monthName(previousMonth).toLowerCase()}`}
    </button>
  );
  if (!budgets.length)
    return (
      <section className="card">
        <Empty
          title="Un mes con un plan"
          text={
            copyable
              ? "Podés repetir el plan del mes anterior o armar uno nuevo."
              : "Definí cuánto querés gastar en cada categoría y moneda."
          }
          action={create}
          actionLabel="Crear presupuesto"
        />
        {copyButton && <div className="empty-extra">{copyButton}</div>}
      </section>
    );
  return (
    <>
      {copyButton && <div className="list-tools">{copyButton}</div>}
      <div className="budget-grid">
        {budgets.map((b) => (
          <section key={b.id} className="card">
            <BudgetProgress
              budget={b}
              category={categories.find((c) => c.id === b.category_id)}
              spent={spent(b.category_id)}
              currency={currency}
            />
            <div className="row-actions">
              <button className="text-button" onClick={() => edit(b)}>
                <Pencil size={16} />
                Editar
              </button>
              <button
                className="danger-link"
                disabled={busy}
                onClick={() => remove(b)}
              >
                <Trash2 size={16} />
                Eliminar
              </button>
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
