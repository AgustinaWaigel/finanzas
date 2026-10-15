"use client";
import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { Empty } from "@/components/ui";
import {
  type Category,
  type Currency,
  type Movement,
  type PaymentMethod,
  byRecent,
} from "../finance/model";
import { type ImportedMovement, readMovementsCsv, toCsv } from "./csv";
import { MovementList } from "./movement-list";

export function MovementsTab({
  rows,
  yearRows,
  year,
  categories,
  currencies,
  currency,
  methods,
  authors,
  authorName,
  busy,
  open,
  create,
  importRows,
}: {
  // Movimientos del mes y la moneda elegidos.
  rows: Movement[];
  // Todo el año cargado, en todas las monedas: es lo que se exporta.
  yearRows: Movement[];
  year: string;
  categories: Category[];
  currencies: Currency[];
  currency: Currency;
  methods: PaymentMethod[];
  // Integrantes para filtrar; null en el espacio personal.
  authors: string[] | null;
  authorName: (id: string) => string;
  busy: boolean;
  open: (item: Movement) => void;
  create: () => void;
  importRows: (items: ImportedMovement[]) => Promise<boolean>;
}) {
  const [search, setSearch] = useState(""),
    [kind, setKind] = useState("all"),
    [member, setMember] = useState("all"),
    [methodFilter, setMethodFilter] = useState("all"),
    [preview, setPreview] = useState<{
      file: string;
      items: ImportedMovement[];
      errors: string[];
    } | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const needle = search.toLocaleLowerCase("es");
  const filtering =
    (authors && member !== "all") ||
    !!search ||
    kind !== "all" ||
    methodFilter !== "all";
  const filtered = rows
    .filter(
      (r) =>
        (!authors || member === "all" || r.user_id === member) &&
        (kind === "all" || r.kind === kind) &&
        (methodFilter === "all" ||
          (methodFilter === "none"
            ? !r.payment_method_id
            : r.payment_method_id === methodFilter)) &&
        `${r.name} ${r.note} ${r.reference || ""} ${categories.find((c) => c.id === r.category_id)?.name || ""}`
          .toLocaleLowerCase("es")
          .includes(needle),
    )
    .sort(byRecent);
  function download() {
    // El BOM hace que Excel lea los acentos como UTF-8.
    const url = URL.createObjectURL(
      new Blob(["﻿" + toCsv([...yearRows].sort(byRecent), categories, methods)], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `clara-movimientos-${year}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="card">
      <div className="list-filters">
        {authors && (
          <select
            aria-label="Filtrar por integrante"
            value={member}
            onChange={(e) => setMember(e.target.value)}
          >
            <option value="all">Todos los integrantes</option>
            {authors.map((id) => (
              <option key={id} value={id}>
                {authorName(id)}
              </option>
            ))}
          </select>
        )}
        <input
          aria-label="Buscar movimientos"
          placeholder="Buscar por concepto, categoría o nota…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label="Tipo de movimiento"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="all">Todos los tipos</option>
          <option value="expense">Gastos</option>
          <option value="income">Ingresos</option>
        </select>
        {methods.length > 0 && (
          <select
            aria-label="Medio de pago"
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value)}
          >
            <option value="all">Todos los medios</option>
            {methods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
            <option value="none">Sin medio de pago</option>
          </select>
        )}
      </div>
      <div className="list-tools">
        <button
          className="text-button"
          disabled={!yearRows.length}
          onClick={download}
        >
          <Download size={15} />
          Exportar {year} (CSV)
        </button>
        <button
          className="text-button"
          disabled={busy}
          onClick={() => picker.current?.click()}
        >
          <Upload size={15} />
          Importar CSV
        </button>
        <input
          ref={picker}
          hidden
          type="file"
          accept=".csv,text/csv"
          aria-label="Archivo CSV para importar"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setPreview({
              file: file.name,
              ...readMovementsCsv(
                await file.text(),
                currencies,
                currency.code,
              ),
            });
          }}
        />
      </div>
      {preview && (
        <div className="import-preview" role="region" aria-label="Importación">
          <strong>{preview.file}</strong>
          <p>
            {preview.items.length === 1
              ? "1 movimiento listo para importar"
              : `${preview.items.length} movimientos listos para importar`}
            {preview.errors.length
              ? ` · ${preview.errors.length} ${preview.errors.length === 1 ? "fila con problemas, que no se va a importar" : "filas con problemas, que no se van a importar"}`
              : ""}
            . Las categorías que no existan se crean; los gastos sin categoría
            van a “Otros”.
          </p>
          {preview.errors.length > 0 && (
            <ul>
              {preview.errors.slice(0, 8).map((line) => (
                <li key={line}>{line}</li>
              ))}
              {preview.errors.length > 8 && (
                <li>…y {preview.errors.length - 8} más.</li>
              )}
            </ul>
          )}
          <div className="row-actions">
            <button
              className="primary"
              disabled={busy || !preview.items.length}
              onClick={async () => {
                if (await importRows(preview.items)) setPreview(null);
              }}
            >
              {busy ? "Importando…" : "Importar"}
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => setPreview(null)}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
      {filtered.length ? (
        <MovementList
          rows={filtered}
          categories={categories}
          currency={currency}
          authorName={authorName}
          open={open}
          methods={methods}
        />
      ) : filtering ? (
        <Empty
          title="No hay movimientos para estos filtros"
          text="Probá con otro integrante, tipo, medio de pago o búsqueda."
          action={() => {
            setMember("all");
            setKind("all");
            setMethodFilter("all");
            setSearch("");
          }}
          actionLabel="Limpiar filtros"
        />
      ) : (
        <Empty
          title="Todavía no hay movimientos"
          text="Registrá tu primer ingreso o gasto para empezar a ver tus números."
          action={create}
        />
      )}
    </section>
  );
}
