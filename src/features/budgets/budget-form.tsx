"use client";
import { useState } from "react";
import {
  type Budget,
  type Category,
  type Currency,
  amountInput,
  storedAmountInput,
} from "../finance/model";
export function BudgetForm({
  item,
  categories,
  currencies,
  currency,
  month,
  busy,
  submit,
}: {
  item?: Budget;
  // Categorías de gasto.
  categories: Category[];
  currencies: Currency[];
  currency: string;
  month: string;
  busy: boolean;
  submit: (form: FormData) => void;
}) {
  const [code, setCode] = useState(item?.currency || currency);
  const decimals = currencies.find((c) => c.code === code)?.decimals ?? 2;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(new FormData(e.currentTarget));
      }}
    >
      <label>
        Mes
        <input
          type="month"
          name="month"
          required
          defaultValue={item?.month.slice(0, 7) || month}
        />
      </label>
      <label>
        Categoría
        <select
          name="category_id"
          required
          defaultValue={item?.category_id || ""}
        >
          <option value="" disabled>
            Elegí una categoría
          </option>
          {categories
            .filter((c) => c.active || c.id === item?.category_id)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
      </label>
      <div className="form-grid">
        <label>
          Moneda
          <select
            name="currency"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          >
            {currencies.map((c) => (
              <option key={c.code}>{c.code}</option>
            ))}
          </select>
        </label>
        <label>
          Presupuesto
          <input
            name="amount"
            inputMode="decimal"
            autoComplete="off"
            required
            defaultValue={storedAmountInput(
              item?.amount,
              currencies.find((c) => c.code === item?.currency)?.decimals,
            )}
            placeholder="0,00"
            onBlur={(e) => {
              e.target.value = amountInput(e.target.value, decimals);
            }}
          />
        </label>
      </div>
      <p className="help">
        Un presupuesto por categoría, mes y moneda. Si ya existe, se actualiza.
      </p>
      <button disabled={busy} className="primary full">
        {busy ? "Guardando…" : "Guardar presupuesto"}
      </button>
    </form>
  );
}
