"use client";
import { useState } from "react";
import {
  type Movement,
  type Category,
  type Currency,
  today,
} from "../finance/model";
export function MovementForm({
  item,
  categories,
  currencies,
  currency,
  busy,
  submit,
  expenseOnly = false,
  referenceEnabled = true,
}: {
  item?: Movement;
  categories: Category[];
  currencies: Currency[];
  currency: string;
  busy: boolean;
  submit: (e: React.FormEvent<HTMLFormElement>) => void;
  expenseOnly?: boolean;
  referenceEnabled?: boolean;
}) {
  const [kind, setKind] = useState(item?.kind || "expense");
  return (
    <form onSubmit={submit}>
      {expenseOnly ? (
        <input type="hidden" name="kind" value="expense" />
      ) : (
        <label>
          Tipo de movimiento
          <select
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as Movement["kind"])}
          >
            <option value="expense">Gasto</option>
            <option value="income">Ingreso</option>
          </select>
        </label>
      )}
      <label>
        {kind === "expense" ? "Ítem o nombre de la compra" : "Concepto"}
        <input
          autoFocus
          name="name"
          required
          maxLength={120}
          placeholder={
            kind === "expense" ? "Ej. Compra de supermercado" : "Ej. Sueldo"
          }
          defaultValue={item?.name}
        />
      </label>
      <div className="form-grid">
        <label>
          Fecha{kind === "expense" ? " de compra" : ""}
          <input
            name="date"
            type="date"
            required
            defaultValue={item?.date || today()}
          />
        </label>
        <label>
          Moneda
          <select name="currency" defaultValue={item?.currency || currency}>
            {currencies.map((c) => (
              <option key={c.code}>{c.code}</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Importe
        <input
          name="amount"
          inputMode="decimal"
          required
          placeholder="0,00"
          defaultValue={item?.amount}
        />
        <small>Sin separadores de miles. Ejemplo: 1250,50.</small>
      </label>
      <label>
        Categoría{kind === "income" ? " (opcional)" : ""}
        <select
          key={kind}
          name="category_id"
          required={kind === "expense"}
          defaultValue={item?.kind === kind ? item.category_id || "" : ""}
        >
          <option value="">
            {kind === "expense" ? "Elegí una categoría" : "Sin categoría"}
          </option>
          {categories
            .filter(
              (c) =>
                c.kind === kind && (c.active || c.id === item?.category_id),
            )
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {!c.active ? " (desactivada)" : ""}
              </option>
            ))}
        </select>
      </label>
      <label>
        Nota (opcional)
        <textarea
          name="note"
          rows={3}
          maxLength={2000}
          defaultValue={item?.note}
        />
      </label>
      <label>
        Referencia (opcional)
        <input
          name="reference"
          maxLength={200}
          defaultValue={item?.reference || ""}
          disabled={!referenceEnabled}
          placeholder="Comercio, comprobante, transferencia..."
        />
        {!referenceEnabled && (
          <small>Disponible al aplicar la nueva migración de familias.</small>
        )}
      </label>
      <button disabled={busy} className="primary full">
        {busy ? "Guardando…" : "Guardar movimiento"}
      </button>
    </form>
  );
}
