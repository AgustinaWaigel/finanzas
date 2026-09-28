import Decimal from "decimal.js";
import {
  type Budget,
  type Category,
  type Currency,
  money,
} from "../finance/model";
export function BudgetProgress({
  budget,
  category,
  spent,
  currency,
}: {
  budget: Budget;
  category?: Category;
  spent: Decimal;
  currency: Currency;
}) {
  const percent = spent.div(budget.amount).mul(100);
  return (
    <div className="budget-progress">
      <div>
        <strong>
          <span className="small-dot" style={{ background: category?.color }} />
          {category?.name}
        </strong>
        <span className={percent.gt(100) ? "negative" : ""}>
          {percent.toFixed(0)}%
        </span>
      </div>
      <div className="progress-track">
        <span
          style={{
            width: `${Decimal.min(percent, 100).toNumber()}%`,
            background: percent.gt(100) ? "#bd574f" : category?.color,
          }}
        />
      </div>
      <div className="budget-caption">
        <span>{money(spent, currency)}</span>
        <span>de {money(budget.amount, currency)}</span>
      </div>
      {percent.gt(100) && (
        <small className="negative">
          Superaste el presupuesto por{" "}
          {money(spent.minus(budget.amount), currency)}
        </small>
      )}
    </div>
  );
}
