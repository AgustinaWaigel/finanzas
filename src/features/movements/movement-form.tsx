"use client";
import { useRef, useState } from "react";
import { Check, Plus, Search } from "lucide-react";
import {
  type Movement,
  type Category,
  type Currency,
  type PaymentMethod,
  amountInput,
  storedAmountInput,
  today,
} from "../finance/model";
import { maxRepeats } from "./build";
import type { Interpreted } from "../voice/schema";
import { VoiceFill } from "../voice/voice-fill";

const plain = (text: string) =>
  text
    .trim()
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
const lastMethodKey = "clara:last-method";
function daysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Orden pensado para cargar rápido: importe, categoría y recién después el detalle.
// Con importe y categoría alcanza: si no hay ítem, se usa el nombre de la categoría.
export function MovementForm({
  item,
  categories,
  currencies,
  currency,
  busy,
  submit,
  expenseOnly = false,
  referenceEnabled = true,
  allowCreate = true,
  methods = [],
  interpret,
}: {
  item?: Movement;
  categories: Category[];
  currencies: Currency[];
  currency: string;
  busy: boolean;
  submit: (form: FormData) => void;
  expenseOnly?: boolean;
  referenceEnabled?: boolean;
  // Crear categorías desde el formulario necesita conexión.
  allowCreate?: boolean;
  // Medios de pago del espacio; vacío si todavía no se cargó ninguno.
  methods?: PaymentMethod[];
  // Dictado con IA: recibe una frase y devuelve los campos. Solo con conexión.
  interpret?: (text: string, currency: string) => Promise<Interpreted>;
}) {
  const [kind, setKind] = useState<Movement["kind"]>(item?.kind || "expense"),
    [code, setCode] = useState(item?.currency || currency),
    [date, setDate] = useState(item?.date || today()),
    [repeat, setRepeat] = useState("none"),
    [query, setQuery] = useState(""),
    [categoryId, setCategoryId] = useState(item?.category_id || ""),
    [newName, setNewName] = useState(""),
    [problem, setProblem] = useState(""),
    [moreOpen, setMoreOpen] = useState(!!(item?.note || item?.reference)),
    [repeatCount, setRepeatCount] = useState<number | null>(null),
    // En un alta se propone el último medio usado en este dispositivo.
    [methodId, setMethodId] = useState(() => {
      if (item) return item.payment_method_id || "";
      try {
        return localStorage.getItem(lastMethodKey) || "";
      } catch {
        return "";
      }
    });
  const payable = methods.filter(
    (m) => m.active || m.id === item?.payment_method_id,
  );
  const method = payable.find((m) => m.id === methodId);
  const amountField = useRef<HTMLInputElement>(null),
    nameField = useRef<HTMLInputElement>(null);
  // Vuelca en el formulario lo que entendió la IA. Lo que no se dijo queda como estaba.
  function applyVoice(result: Interpreted) {
    const nextCode =
      result.currency && currencies.some((c) => c.code === result.currency)
        ? result.currency
        : code;
    setKind(result.kind);
    setCode(nextCode);
    const understood = /^\d+(\.\d+)?$/.test(result.amount ?? "");
    if (understood && amountField.current)
      amountField.current.value = storedAmountInput(
        result.amount!,
        currencies.find((c) => c.code === nextCode)?.decimals,
      );
    if (result.item && nameField.current)
      nameField.current.value = result.item.slice(0, 120);
    if (result.date && /^\d{4}-\d{2}-\d{2}$/.test(result.date))
      setDate(result.date);
    const wantedCategory = result.category?.trim().slice(0, 60) ?? "";
    const existing = categories.find(
      (c) =>
        c.kind === result.kind &&
        c.active &&
        plain(c.name) === plain(wantedCategory),
    );
    setCategoryId(existing?.id ?? "");
    setNewName(!existing && allowCreate ? wantedCategory : "");
    const paid = payable.find(
      (m) => result.method && plain(m.name) === plain(result.method),
    );
    if (paid) setMethodId(paid.id);
    const parts = result.installments ?? 0;
    if (result.kind === "expense" && parts >= 2 && parts <= maxRepeats) {
      setRepeat("installments");
      setRepeatCount(parts);
      setMoreOpen(true);
    }
    setQuery("");
    setProblem("");
    if (!understood) return "No entendí el importe: completalo a mano.";
    if (result.more)
      return "Detecté más de un movimiento y cargué el primero. Guardalo y dictá el siguiente.";
  }
  const decimals = currencies.find((c) => c.code === code)?.decimals ?? 2;
  const options = categories.filter(
    (c) => c.kind === kind && (c.active || c.id === item?.category_id),
  );
  const needle = plain(query);
  const shown = options.filter((c) => plain(c.name).includes(needle));
  const wanted = query.trim();
  const canCreate =
    allowCreate &&
    wanted.length > 0 &&
    wanted.length <= 60 &&
    !options.some((c) => plain(c.name) === needle);
  const chosen = options.find((c) => c.id === categoryId);
  function choose(id: string) {
    // En ingresos la categoría es opcional: tocarla de nuevo la quita.
    setCategoryId(id === categoryId && kind === "income" ? "" : id);
    setNewName("");
    setQuery("");
    setProblem("");
  }
  function create() {
    setNewName(wanted);
    setCategoryId("");
    setQuery("");
    setProblem("");
  }
  function changeKind(next: Movement["kind"]) {
    if (next === kind) return;
    setKind(next);
    setCategoryId(item?.kind === next ? item.category_id || "" : "");
    setNewName("");
    setQuery("");
    setProblem("");
    if (next === "income" && repeat === "installments") setRepeat("none");
  }
  return (
    <form
      className="movement-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (kind === "expense" && !chosen && !newName) {
          setProblem(
            allowCreate
              ? "Elegí una categoría o escribí una nueva."
              : "Elegí una categoría.",
          );
          return;
        }
        try {
          if (method) localStorage.setItem(lastMethodKey, method.id);
          else localStorage.removeItem(lastMethodKey);
        } catch {}
        submit(new FormData(e.currentTarget));
      }}
    >
      {interpret && !item && (
        <VoiceFill
          interpret={(text) => interpret(text, code)}
          apply={applyVoice}
        />
      )}
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="payment_method_id" value={method?.id ?? ""} />
      <input type="hidden" name="category_id" value={chosen?.id ?? ""} />
      <input type="hidden" name="category_new" value={newName} />
      <input
        type="hidden"
        name="category_name"
        value={newName || chosen?.name || ""}
      />
      {!expenseOnly && (
        <div className="segmented" role="group" aria-label="Tipo de movimiento">
          <button
            type="button"
            aria-pressed={kind === "expense"}
            onClick={() => changeKind("expense")}
          >
            Gasto
          </button>
          <button
            type="button"
            aria-pressed={kind === "income"}
            onClick={() => changeKind("income")}
          >
            Ingreso
          </button>
        </div>
      )}
      <div className="amount-row">
        <label>
          Importe
          <input
            autoFocus={!item}
            ref={amountField}
            className="amount-input"
            name="amount"
            inputMode="decimal"
            autoComplete="off"
            enterKeyHint="next"
            required
            placeholder="0,00"
            defaultValue={storedAmountInput(
              item?.amount,
              currencies.find((c) => c.code === item?.currency)?.decimals,
            )}
            onBlur={(e) => {
              e.target.value = amountInput(e.target.value, decimals);
            }}
          />
        </label>
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
      </div>
      <div className="category-picker">
        <label htmlFor="category-search">
          Categoría{kind === "income" ? " (opcional)" : ""}
        </label>
        {(chosen || newName) && (
          <p className="category-chosen" aria-live="polite">
            <Check size={15} />
            {newName ? (
              <>
                Nueva categoría: <strong>{newName}</strong>
              </>
            ) : (
              <strong>{chosen!.name}</strong>
            )}
          </p>
        )}
        <div className="category-search">
          <Search size={16} aria-hidden="true" />
          <input
            id="category-search"
            type="search"
            autoComplete="off"
            enterKeyHint="done"
            maxLength={60}
            placeholder={
              allowCreate ? "Buscar o escribir una nueva…" : "Buscar…"
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              // Enter elige la coincidencia o crea la categoría, sin enviar el formulario.
              e.preventDefault();
              if (!wanted) return;
              const exact = options.find((c) => plain(c.name) === needle);
              if (exact) choose(exact.id);
              else if (shown.length === 1) choose(shown[0].id);
              else if (canCreate) create();
            }}
          />
        </div>
        <div className="chip-list">
          {shown.map((c) => (
            <button
              type="button"
              key={c.id}
              className="chip"
              aria-pressed={c.id === categoryId}
              onClick={() => choose(c.id)}
            >
              <i style={{ background: c.color }} />
              {c.name}
              {!c.active ? " (desactivada)" : ""}
            </button>
          ))}
          {canCreate && (
            <button type="button" className="chip create" onClick={create}>
              <Plus size={14} />
              Crear “{wanted}”
            </button>
          )}
          {!shown.length && !canCreate && (
            <small>
              {wanted
                ? "No hay categorías con ese nombre."
                : kind === "income"
                  ? "Todavía no hay categorías de ingreso."
                  : "Todavía no hay categorías."}
            </small>
          )}
        </div>
        {problem && (
          <p className="form-error" role="alert">
            {problem}
          </p>
        )}
      </div>
      {payable.length > 0 && (
        <div className="category-picker">
          <label id="method-label">
            {kind === "expense" ? "¿Con qué pagaste?" : "¿Dónde lo recibiste?"}{" "}
            (opcional)
          </label>
          <div className="chip-list" role="group" aria-labelledby="method-label">
            {payable.map((m) => (
              <button
                type="button"
                key={m.id}
                className="chip"
                aria-pressed={m.id === method?.id}
                onClick={() => setMethodId(m.id === method?.id ? "" : m.id)}
              >
                {m.name}
                {!m.active ? " (desactivado)" : ""}
              </button>
            ))}
          </div>
        </div>
      )}
      <label>
        {kind === "expense" ? "Ítem o nombre de la compra" : "Concepto"}{" "}
        (opcional)
        <input
          ref={nameField}
          name="name"
          maxLength={120}
          placeholder={
            kind === "expense" ? "Ej. Compra de supermercado" : "Ej. Sueldo"
          }
          defaultValue={item?.name}
        />
      </label>
      <div className="date-row">
        <label>
          Fecha
          <input
            name="date"
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <div className="segmented" role="group" aria-label="Fechas rápidas">
          <button
            type="button"
            aria-pressed={date === today()}
            onClick={() => setDate(today())}
          >
            Hoy
          </button>
          <button
            type="button"
            aria-pressed={date === daysAgo(1)}
            onClick={() => setDate(daysAgo(1))}
          >
            Ayer
          </button>
        </div>
      </div>
      <details
        className="more-options"
        open={moreOpen}
        onToggle={(e) => setMoreOpen(e.currentTarget.open)}
      >
        <summary>
          Más opciones
          <small>
            {item ? "Nota y referencia" : "Cuotas, repetir, nota y referencia"}
          </small>
        </summary>
        {!item && (
          <>
            <div className="form-grid">
              <label>
                Repetir
                <select
                  name="repeat"
                  value={repeat}
                  onChange={(e) => setRepeat(e.target.value)}
                >
                  <option value="none">No repetir</option>
                  {kind === "expense" && (
                    <option value="installments">En cuotas</option>
                  )}
                  <option value="monthly">Todos los meses</option>
                </select>
              </label>
              {repeat !== "none" && (
                <label>
                  {repeat === "installments" ? "Cuotas" : "Meses"}
                  <input
                    key={`${repeat}-${repeatCount}`}
                    name="repeat_count"
                    type="number"
                    inputMode="numeric"
                    min={2}
                    max={maxRepeats}
                    required
                    defaultValue={
                      repeatCount ?? (repeat === "installments" ? 3 : 12)
                    }
                  />
                </label>
              )}
            </div>
            {repeat !== "none" && (
              <p className="help">
                {repeat === "installments"
                  ? "El total se reparte en cuotas iguales, una por mes desde la fecha elegida."
                  : "Se carga el mismo movimiento una vez por mes desde la fecha elegida. Sirve para alquiler, servicios o sueldo."}{" "}
                Después podés editar o eliminar cada mes por separado.
              </p>
            )}
          </>
        )}
        <label>
          Nota
          <textarea
            name="note"
            rows={2}
            maxLength={2000}
            defaultValue={item?.note}
          />
        </label>
        <label>
          Referencia
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
      </details>
      <div className="form-submit">
        <button disabled={busy} className="primary full">
          {busy ? "Guardando…" : "Guardar movimiento"}
        </button>
      </div>
    </form>
  );
}
