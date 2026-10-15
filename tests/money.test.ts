import { test } from "node:test";
import assert from "node:assert/strict";
import Decimal from "decimal.js";
import {
  parseAmount,
  amountInput,
  storedAmountInput,
  splitAmount,
  addMonths,
  shiftMonth,
  variation,
  byRecent,
  money,
  totals,
  initialCurrencies,
  type Movement,
} from "../src/features/finance/model";
test("monedas extensibles con cero o cuatro decimales", () => {
  assert.equal(parseAmount("123", 0), "123");
  assert.throws(() => parseAmount("123.50", 0));
  assert.equal(parseAmount("0,0001", 4), "0.0001");
});
test("importes precisos y formato argentino sin pérdida en números grandes", () => {
  assert.equal(parseAmount("0,10"), "0.10");
  assert.equal(
    money("99999999999999.99", initialCurrencies[0]),
    "$ 99.999.999.999.999,99",
  );
  assert.equal(money("-12.30", initialCurrencies[1]), "−US$ 12,30");
});
test("rechaza negativos, cero, miles mal agrupados, exponentes y exceso de decimales", () => {
  for (const value of [
    "0",
    "-1",
    "1.23,56",
    "12,34.56",
    "1.234.56",
    "1,2,3",
    "1,234",
    "1e3",
    "NaN",
    "Infinity",
    "1.2345",
    "0.000",
    "100000000000000",
    "",
  ])
    assert.throws(() => parseAmount(value));
});
test("totales separados por moneda, período y tipo con aritmética decimal", () => {
  const row = (
    amount: string,
    currency: string,
    kind: "expense" | "income",
    date = "2026-09-01",
  ): Movement => ({
    id: "x",
    user_id: "author",
    date,
    name: "Prueba",
    amount,
    currency,
    kind,
    category_id: null,
    note: "",
    receipt_path: null,
  });
  const rows = [
    row("0.1", "ARS", "expense"),
    row("0.2", "ARS", "expense"),
    row("1", "ARS", "income"),
    row("999", "USD", "expense"),
    row("10", "ARS", "expense", "2026-08-01"),
  ];
  const t = totals(rows, "ARS", "2026-09");
  assert.equal(t.expense.toString(), "0.3");
  assert.equal(t.balance.toString(), "0.7");
  assert.equal(totals(rows, "USD", "2026-09").expense.toString(), "999");
  assert.equal(totals([], "ARS").balance.toString(), "0");
});
test("acepta formato argentino y separadores de miles sin ambigüedad", () => {
  assert.equal(parseAmount("1.250,50"), "1250.50");
  assert.equal(parseAmount("1,250.50"), "1250.50");
  assert.equal(parseAmount("$ 1.234.567"), "1234567.00");
  assert.equal(parseAmount("1.234"), "1234.00");
  assert.equal(parseAmount("12.5"), "12.50");
  assert.equal(parseAmount("1250.50"), "1250.50");
  // Con tres o más decimales, un único punto es decimal.
  assert.equal(parseAmount("1.234", 3), "1.234");
  assert.equal(parseAmount("1.234", 0), "1234");
});
test("el campo de importe ida y vuelta conserva el valor", () => {
  assert.equal(amountInput("1250,5"), "1.250,50");
  assert.equal(amountInput("abc"), "abc");
  assert.equal(amountInput(""), "");
  for (const [stored, decimals] of [
    ["1250.50", 2],
    ["1.250", 3],
    ["1250", 0],
    ["0.0001", 4],
    ["99999999999999.99", 2],
  ] as const) {
    const shown = storedAmountInput(stored, decimals);
    assert.equal(parseAmount(shown, decimals), stored);
    assert.equal(parseAmount(amountInput(shown, decimals), decimals), stored);
  }
});
test("cuotas exactas, meses y variación", () => {
  assert.deepEqual(splitAmount("100.00", 3), ["33.33", "33.33", "33.34"]);
  assert.deepEqual(splitAmount("10", 3, 0), ["3", "3", "4"]);
  assert.throws(() => splitAmount("0.02", 3));
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2026-11-15", 2), "2027-01-15");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(variation(new Decimal(112), new Decimal(100)), 12);
  assert.equal(variation(new Decimal(50), new Decimal(100)), -50);
  assert.equal(variation(new Decimal(50), new Decimal(0)), null);
});
test("orden: fecha y, en el mismo día, lo último cargado primero", () => {
  const row = (id: string, date: string, created_at: string): Movement => ({
    id,
    user_id: "u",
    date,
    name: id,
    amount: "1",
    currency: "ARS",
    kind: "expense",
    category_id: null,
    note: "",
    receipt_path: null,
    created_at,
  });
  const sorted = [
    row("a", "2026-09-01", "2026-09-01T10:00:00Z"),
    row("b", "2026-09-02", "2026-09-02T08:00:00Z"),
    row("c", "2026-09-01", "2026-09-01T12:00:00Z"),
  ].sort(byRecent);
  assert.deepEqual(
    sorted.map((r) => r.id),
    ["b", "c", "a"],
  );
});
