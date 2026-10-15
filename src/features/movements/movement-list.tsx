import { ArrowDownLeft, ArrowUpRight, ChevronRight } from "lucide-react";
import {
  type Category,
  type Currency,
  type Movement,
  type PaymentMethod,
  money,
} from "../finance/model";
export function MovementList({
  rows,
  categories,
  currency,
  authorName,
  open,
  methods = [],
}: {
  rows: Movement[];
  categories: Category[];
  currency: Currency;
  authorName: (id: string) => string;
  open: (item: Movement) => void;
  methods?: PaymentMethod[];
}) {
  return (
    <div className="movement-list">
      {rows.map((r) => (
        <button className="movement" key={r.id} onClick={() => open(r)}>
          <span
            className={`movement-icon ${r.kind === "income" ? "incoming" : ""}`}
          >
            {r.kind === "income" ? (
              <ArrowDownLeft size={20} />
            ) : (
              <ArrowUpRight size={20} />
            )}
          </span>
          <span className="grow">
            <strong>{r.name}</strong>
            <small>
              {categories.find((c) => c.id === r.category_id)?.name ||
                "Ingreso"}{" "}
              · {r.date.split("-").reverse().join("/")}
              {r.receipt_path ? " · Ticket" : ""}
            </small>
            <small className="movement-author">
              Cargado por {authorName(r.user_id)}
              {r.payment_method_id &&
                methods.some((m) => m.id === r.payment_method_id) &&
                ` · ${methods.find((m) => m.id === r.payment_method_id)!.name}`}
            </small>
          </span>
          <strong className={r.kind === "income" ? "positive" : ""}>
            {r.kind === "income" ? "+" : "−"}
            {money(r.amount, currency)}
          </strong>
          <ChevronRight size={16} />
        </button>
      ))}
    </div>
  );
}
