import {
  type Currency,
  type Movement,
  addMonths,
  parseAmount,
  splitAmount,
} from "../finance/model";

export type MovementFields = {
  date: string;
  name: string;
  kind: Movement["kind"];
  amount: string;
  currency: string;
  category_id: string | null;
  note: string;
  reference?: string;
  payment_method_id?: string | null;
};
export type NewMovement = MovementFields & {
  id: string;
  family_id?: string | null;
};
export const maxRepeats = 60;

export type Scope = {
  familyEnabled: boolean;
  familyId: string | null;
  // Los medios de pago existen recién con su migración aplicada.
  paymentsEnabled?: boolean;
};
// Lee y valida el formulario de movimiento. Referencia y medio de pago dependen de migraciones.
export function movementFields(
  f: FormData,
  currencies: Currency[],
  scope: Scope,
): MovementFields {
  const code = String(f.get("currency"));
  const currency = currencies.find((c) => c.code === code);
  if (!currency) throw new Error("Elegí una moneda disponible.");
  const kind = String(f.get("kind")) as Movement["kind"];
  const amount = parseAmount(String(f.get("amount")), currency.decimals);
  const category_id = String(f.get("category_id") || "") || null;
  if (kind === "expense" && !category_id)
    throw new Error("Elegí una categoría.");
  // Sin ítem, el movimiento lleva el nombre de su categoría.
  const name =
    String(f.get("name") ?? "").trim() ||
    String(f.get("category_name") ?? "").trim() ||
    (kind === "income" ? "Ingreso" : "");
  if (!name) throw new Error("Ingresá un ítem o elegí una categoría.");
  return {
    date: String(f.get("date")),
    name,
    kind,
    amount,
    currency: code,
    category_id,
    note: String(f.get("note") ?? "").trim(),
    ...(scope.familyEnabled
      ? { reference: String(f.get("reference") ?? "").trim() }
      : {}),
    ...(scope.paymentsEnabled
      ? { payment_method_id: String(f.get("payment_method_id") || "") || null }
      : {}),
  };
}

// "installments" reparte el importe en cuotas; "monthly" repite el mismo importe cada mes.
export function movementSeries(
  fields: MovementFields,
  repeat: string,
  count: number,
  decimals: number,
): MovementFields[] {
  if (repeat !== "installments" && repeat !== "monthly") return [fields];
  if (!Number.isInteger(count) || count < 2 || count > maxRepeats)
    throw new Error(`Indicá entre 2 y ${maxRepeats} meses.`);
  const amounts =
    repeat === "installments"
      ? splitAmount(fields.amount, count, decimals)
      : Array<string>(count).fill(fields.amount);
  return amounts.map((amount, i) => {
    const suffix = repeat === "installments" ? ` (cuota ${i + 1}/${count})` : "";
    return {
      ...fields,
      amount,
      date: addMonths(fields.date, i),
      name: fields.name.slice(0, 120 - suffix.length).trimEnd() + suffix,
    };
  });
}

export function newMovements(
  f: FormData,
  currencies: Currency[],
  scope: Scope,
): NewMovement[] {
  const fields = movementFields(f, currencies, scope);
  const decimals = currencies.find((c) => c.code === fields.currency)!.decimals;
  return movementSeries(
    fields,
    String(f.get("repeat") || "none"),
    Number(f.get("repeat_count")),
    decimals,
  ).map((m) => ({
    id: crypto.randomUUID(),
    ...(scope.familyEnabled ? { family_id: scope.familyId } : {}),
    ...m,
  }));
}
