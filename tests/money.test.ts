import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseAmount,
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
test("rechaza negativos, cero, miles ambiguos, exponentes y exceso de decimales", () => {
  for (const value of [
    "0",
    "-1",
    "1.234,56",
    "1,234.56",
    "1e3",
    "NaN",
    "Infinity",
    "1.234",
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
