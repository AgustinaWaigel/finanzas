import {
  type Category,
  type Currency,
  type Movement,
  type PaymentMethod,
  parseAmount,
} from "../finance/model";

export const csvColumns = [
  "Fecha",
  "Tipo",
  "Concepto",
  "Importe",
  "Moneda",
  "Categoría",
  "Nota",
  "Referencia",
  "Medio de pago",
] as const;
export type ImportedMovement = {
  date: string;
  kind: Movement["kind"];
  name: string;
  amount: string;
  currency: string;
  category: string;
  note: string;
  reference: string;
  method: string;
};

// Una celda que empieza con =, +, - o @ se ejecuta como fórmula en planillas.
const guard = (text: string) => (/^[=+\-@\t\r]/.test(text) ? "'" + text : text);
const cell = (text: string) =>
  /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;

// Punto y coma y coma decimal: es lo que abre bien Excel con configuración argentina.
export function toCsv(
  rows: Movement[],
  categories: Category[],
  methods: PaymentMethod[] = [],
) {
  const lines = rows.map((r) =>
    [
      r.date,
      r.kind === "expense" ? "Gasto" : "Ingreso",
      guard(r.name),
      r.amount.replace(".", ","),
      r.currency,
      guard(categories.find((c) => c.id === r.category_id)?.name ?? ""),
      guard(r.note),
      guard(r.reference ?? ""),
      guard(methods.find((m) => m.id === r.payment_method_id)?.name ?? ""),
    ]
      .map(cell)
      .join(";"),
  );
  return [csvColumns.join(";"), ...lines].join("\r\n") + "\r\n";
}

export function parseCsv(text: string) {
  const source = text.replace(/^﻿/, "");
  const firstLine = source.split(/\r?\n/, 1)[0];
  const delimiter =
    firstLine.split(";").length >= firstLine.split(",").length ? ";" : ",";
  const table: string[][] = [];
  let row: string[] = [],
    value = "",
    quoted = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') {
        value += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else value += ch;
    } else if (ch === '"' && value === "") quoted = true;
    else if (ch === delimiter) {
      row.push(value);
      value = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[i + 1] === "\n") i++;
      row.push(value);
      table.push(row);
      row = [];
      value = "";
    } else value += ch;
  }
  if (value !== "" || row.length) {
    row.push(value);
    table.push(row);
  }
  return table.filter((r) => r.some((c) => c.trim() !== ""));
}

const plain = (text: string) =>
  text
    .trim()
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
const unguard = (text: string) => text.replace(/^'(?=[=+\-@])/, "").trim();

function parseDate(text: string) {
  const value = text.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const localDate = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  const [y, m, d] = iso
    ? [iso[1], iso[2], iso[3]]
    : localDate
      ? [
          localDate[3],
          localDate[2].padStart(2, "0"),
          localDate[1].padStart(2, "0"),
        ]
      : ["", "", ""];
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (!y || date.getUTCMonth() !== Number(m) - 1 || date.getUTCDate() !== Number(d))
    throw new Error("fecha inválida (usá AAAA-MM-DD o DD/MM/AAAA)");
  return `${y}-${m}-${d}`;
}

// Interpreta un CSV con encabezados. Devuelve las filas válidas y un detalle de las que no.
export function readMovementsCsv(
  text: string,
  currencies: Currency[],
  defaultCurrency: string,
) {
  const [header, ...lines] = parseCsv(text);
  const items: ImportedMovement[] = [],
    errors: string[] = [];
  if (!header) return { items, errors: ["El archivo está vacío."] };
  const names = header.map(plain);
  const column = (...options: string[]) =>
    names.findIndex((n) => options.includes(n));
  const at = {
    date: column("fecha"),
    kind: column("tipo"),
    name: column("concepto", "nombre", "item", "descripcion"),
    amount: column("importe", "monto", "precio"),
    currency: column("moneda"),
    category: column("categoria"),
    note: column("nota", "notas"),
    reference: column("referencia"),
    method: column("medio de pago", "medio", "pago"),
  };
  if (at.date < 0 || at.name < 0 || at.amount < 0)
    return {
      items,
      errors: [
        "Faltan columnas obligatorias. La primera fila debe incluir Fecha, Concepto e Importe.",
      ],
    };
  lines.forEach((line, index) => {
    const get = (i: number) => (i >= 0 ? (line[i] ?? "") : "");
    try {
      const kindText = plain(get(at.kind));
      const kind = ["ingreso", "income"].includes(kindText)
        ? "income"
        : ["", "gasto", "expense", "egreso"].includes(kindText)
          ? "expense"
          : null;
      if (!kind) throw new Error("tipo desconocido (usá Gasto o Ingreso)");
      const code = get(at.currency).trim().toUpperCase() || defaultCurrency;
      const currency = currencies.find((c) => c.code === code);
      if (!currency) throw new Error(`moneda ${code} no disponible`);
      const name = unguard(get(at.name));
      if (!name) throw new Error("falta el concepto");
      if (name.length > 120) throw new Error("el concepto supera 120 caracteres");
      const note = unguard(get(at.note)),
        reference = unguard(get(at.reference)),
        category = unguard(get(at.category));
      if (note.length > 2000) throw new Error("la nota supera 2000 caracteres");
      if (reference.length > 200)
        throw new Error("la referencia supera 200 caracteres");
      if (category.length > 60)
        throw new Error("la categoría supera 60 caracteres");
      let amount: string;
      try {
        amount = parseAmount(get(at.amount), currency.decimals);
      } catch {
        throw new Error("importe inválido");
      }
      items.push({
        date: parseDate(get(at.date)),
        kind,
        name,
        amount,
        currency: code,
        category,
        note,
        reference,
        method: unguard(get(at.method)),
      });
    } catch (e) {
      errors.push(`Fila ${index + 2}: ${(e as Error).message}.`);
    }
  });
  return { items, errors };
}
