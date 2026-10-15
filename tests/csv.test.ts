import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toCsv,
  parseCsv,
  readMovementsCsv,
} from "../src/features/movements/csv";
import {
  initialCurrencies,
  type Category,
  type Movement,
} from "../src/features/finance/model";

const categories: Category[] = [
  { id: "c1", name: "Supermercado", color: "#176b51", kind: "expense", active: true },
];
const movement = (extra: Partial<Movement>): Movement => ({
  id: "m1",
  user_id: "u",
  date: "2026-09-01",
  name: "Compra",
  amount: "1250.50",
  currency: "ARS",
  kind: "expense",
  category_id: "c1",
  note: "",
  reference: "",
  receipt_path: null,
  ...extra,
});

test("CSV: exportar e importar conserva los datos, incluso con comillas y saltos", () => {
  const rows = [
    movement({ name: 'Yerba "premium"; 1kg', note: "línea 1\nlínea 2", payment_method_id: "p1" }),
    movement({
      id: "m2",
      kind: "income",
      name: "Sueldo",
      amount: "300.00",
      currency: "USD",
      category_id: null,
      reference: "Transferencia 123",
    }),
  ];
  const csv = toCsv(rows, categories, [
    { id: "p1", name: "Visa", kind: "credit", active: true },
  ]);
  assert.equal(csv.split("\r\n")[0], "Fecha;Tipo;Concepto;Importe;Moneda;Categoría;Nota;Referencia;Medio de pago");
  const { items, errors } = readMovementsCsv(csv, initialCurrencies, "ARS");
  assert.deepEqual(errors, []);
  assert.deepEqual(items, [
    {
      date: "2026-09-01",
      kind: "expense",
      name: 'Yerba "premium"; 1kg',
      amount: "1250.50",
      currency: "ARS",
      category: "Supermercado",
      note: "línea 1\nlínea 2",
      reference: "",
      method: "Visa",
    },
    {
      date: "2026-09-01",
      kind: "income",
      name: "Sueldo",
      amount: "300.00",
      currency: "USD",
      category: "",
      note: "",
      reference: "Transferencia 123",
      method: "",
    },
  ]);
});

test("CSV: neutraliza fórmulas al exportar y las recupera al importar", () => {
  const csv = toCsv([movement({ name: "=HYPERLINK(1)" })], categories);
  assert.match(csv, /;'=HYPERLINK\(1\);/);
  assert.equal(
    readMovementsCsv(csv, initialCurrencies, "ARS").items[0].name,
    "=HYPERLINK(1)",
  );
});

test("CSV: acepta planillas con coma, fechas locales y columnas mínimas", () => {
  const { items, errors } = readMovementsCsv(
    '﻿fecha,concepto,importe\n5/9/2026,Verdulería,"1.250,50"\n',
    initialCurrencies,
    "ARS",
  );
  assert.deepEqual(errors, []);
  assert.equal(items[0].date, "2026-09-05");
  assert.equal(items[0].amount, "1250.50");
  assert.equal(items[0].kind, "expense");
  assert.equal(items[0].currency, "ARS");
  assert.deepEqual(parseCsv("a;b\r\n\r\n1;2"), [
    ["a", "b"],
    ["1", "2"],
  ]);
});

test("CSV: informa cada fila inválida sin descartar las válidas", () => {
  const { items, errors } = readMovementsCsv(
    [
      "Fecha;Tipo;Concepto;Importe;Moneda",
      "2026-09-01;Gasto;Ok;10;ARS",
      "2026-02-30;Gasto;Fecha mala;10;ARS",
      "2026-09-01;Otro;Tipo malo;10;ARS",
      "2026-09-01;Gasto;Importe malo;-5;ARS",
      "2026-09-01;Gasto;Moneda mala;10;EUR",
      "2026-09-01;Gasto;;10;ARS",
    ].join("\n"),
    initialCurrencies,
    "ARS",
  );
  assert.equal(items.length, 1);
  assert.equal(errors.length, 5);
  assert.match(errors[0], /^Fila 3: fecha inválida/);
  assert.match(errors[3], /^Fila 6: moneda EUR/);
  assert.match(
    readMovementsCsv("Concepto;Importe\nA;1", initialCurrencies, "ARS").errors[0],
    /Faltan columnas/,
  );
});
