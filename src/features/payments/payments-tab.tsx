"use client";
import { useState } from "react";
import {
  ArrowRight,
  Banknote,
  CreditCard,
  Landmark,
  Pencil,
  Repeat,
  Smartphone,
  Trash2,
} from "lucide-react";
import Decimal from "decimal.js";
import { Empty } from "@/components/ui";
import type { Upcoming } from "../finance/use-finance-data";
import {
  type Currency,
  type Movement,
  type PaymentMethod,
  type Transfer,
  amountInput,
  methodKinds,
  money,
  monthName,
  shiftMonth,
  shortDate,
  statementDates,
  statementMonth,
  storedAmountInput,
  today,
} from "../finance/model";

const icons = {
  cash: Banknote,
  wallet: Smartphone,
  debit: CreditCard,
  credit: CreditCard,
  transfer: Landmark,
};
export const suggestedMethods: { name: string; kind: PaymentMethod["kind"] }[] =
  [
    { name: "Efectivo", kind: "cash" },
    { name: "Mercado Pago", kind: "wallet" },
    { name: "Tarjeta de crédito", kind: "credit" },
    { name: "Tarjeta de débito", kind: "debit" },
  ];

// Cuánta plata hay en cada cuenta, cuánto se gastó con cada medio y qué viene de cada tarjeta.
// Todo sale de lo ingresado a mano.
export function PaymentsTab({
  enabled,
  accountsEnabled,
  methods,
  rows,
  upcoming,
  transfers,
  balances,
  currencies,
  currency,
  month,
  busy,
  create,
  quickCreate,
  edit,
  transfer,
  removeTransfer,
}: {
  enabled: boolean;
  // Saldos, cierre de tarjeta y transferencias dependen de la migración de cuentas.
  accountsEnabled: boolean;
  methods: PaymentMethod[];
  rows: Movement[];
  upcoming: Upcoming[];
  transfers: Transfer[];
  // Saldo actual por medio, solo de las cuentas que lo llevan.
  balances: Record<string, string>;
  currencies: Currency[];
  currency: Currency;
  month: string;
  busy: boolean;
  create: () => void;
  quickCreate: (name: string, kind: PaymentMethod["kind"]) => void;
  edit: (item: PaymentMethod) => void;
  transfer: () => void;
  removeTransfer: (item: Transfer) => void;
}) {
  if (!enabled)
    return (
      <section className="card">
        <div className="alert">
          Falta aplicar la migración{" "}
          <code>202610090005_payment_methods.sql</code> en el SQL Editor de
          Supabase. El resto de la app funciona igual.
        </div>
      </section>
    );
  // Lo cargado del año y lo que cae después pueden repetirse: se unifica por id.
  const expenses = [
    ...new Map(
      [...rows, ...upcoming]
        .filter((r) => r.kind === "expense" && r.currency === currency.code)
        .map((r) => [r.id, r] as const),
    ).values(),
  ];
  const total = (list: { amount: string }[]) =>
    list.reduce((s, r) => s.plus(r.amount), new Decimal(0));
  const inMonth = expenses.filter((r) => r.date.startsWith(month));
  const next = [1, 2, 3].map((n) => shiftMonth(month, n));
  const unassigned = inMonth.filter((r) => !r.payment_method_id);
  const name = (id: string) =>
    methods.find((m) => m.id === id)?.name ?? "Medio eliminado";
  const coin = (code?: string | null) =>
    currencies.find((c) => c.code === code) ?? currency;
  const accounts = methods.filter((m) => balances[m.id] !== undefined);
  const totals = currencies
    .map((c) => ({
      currency: c,
      list: accounts.filter((m) => m.currency === c.code),
    }))
    .filter((t) => t.list.length);
  const monthTransfers = transfers
    .filter((t) => t.date.startsWith(month))
    .sort((a, b) => b.date.localeCompare(a.date));
  const suggestions = suggestedMethods.filter(
    (s) => !methods.some((m) => m.name.toLowerCase() === s.name.toLowerCase()),
  );
  const quick = suggestions.length > 0 && (
    <div className="chip-list">
      {suggestions.map((s) => (
        <button
          key={s.name}
          className="chip create"
          disabled={busy}
          onClick={() => quickCreate(s.name, s.kind)}
        >
          + {s.name}
        </button>
      ))}
    </div>
  );
  if (!methods.length)
    return (
      <section className="card">
        <Empty
          title="Tus medios de pago, a mano"
          text="Anotá con qué pagás cada gasto. Clara no se conecta con tu banco ni con Mercado Pago: todo lo cargás vos."
          action={create}
          actionLabel="Nuevo medio de pago"
        />
        <p className="help centered">O empezá con uno de estos:</p>
        <div className="empty-extra">{quick}</div>
      </section>
    );
  return (
    <>
      {!accountsEnabled && (
        <div className="alert">
          Para llevar saldos, cierre de tarjetas y transferencias, aplicá la
          migración <code>202610090006_accounts.sql</code> en Supabase.
        </div>
      )}
      {totals.length > 0 && (
        <div className="summary-grid balance-grid">
          {totals.map(({ currency: c, list }) => (
            <section
              key={c.code}
              className="summary-card dark"
              aria-label={`Plata disponible en ${c.code}`}
            >
              <div className="summary-top">
                <span>Tenés hoy · {c.code}</span>
              </div>
              <strong className="summary-value">
                {money(
                  list.reduce(
                    (s, m) => s.plus(balances[m.id]),
                    new Decimal(0),
                  ),
                  c,
                )}
              </strong>
              <small>
                {list.length === 1
                  ? `En ${list[0].name}`
                  : `Entre ${list.length} cuentas`}
              </small>
            </section>
          ))}
        </div>
      )}
      {accountsEnabled && (
        <div className="list-tools">
          <button
            className="text-button"
            disabled={busy || !methods.some((m) => m.currency)}
            onClick={transfer}
          >
            <Repeat size={15} />
            Transferir o pagar tarjeta
          </button>
          {!methods.some((m) => m.currency) && (
            <span className="help">
              Editá una cuenta y elegí su moneda para poder transferir.
            </span>
          )}
        </div>
      )}
      <div className="budget-grid">
        {methods.map((m) => {
          const mine = expenses.filter((r) => r.payment_method_id === m.id);
          const current = mine.filter((r) => r.date.startsWith(month));
          const later = mine.filter((r) => r.date.slice(0, 7) > month);
          const Icon = icons[m.kind];
          const closing = m.kind === "credit" ? (m.closing_day ?? null) : null;
          // Con día de cierre, las compras se agrupan por resumen en vez de por mes calendario.
          const statement = (period: string) =>
            mine.filter((r) => statementMonth(r.date, closing) === period);
          return (
            <section
              key={m.id}
              className={`card method-card ${m.active ? "" : "inactive"}`}
            >
              <div className="method-heading">
                <span className="method-icon">
                  <Icon size={20} />
                </span>
                <span className="grow">
                  <strong>{m.name}</strong>
                  <small>
                    {methodKinds[m.kind]}
                    {m.currency ? ` · ${m.currency}` : ""}
                    {m.active ? "" : " · Desactivado"}
                  </small>
                </span>
                <button
                  className="icon-button"
                  aria-label={`Editar ${m.name}`}
                  onClick={() => edit(m)}
                >
                  <Pencil size={16} />
                </button>
              </div>
              {balances[m.id] !== undefined && (
                <div className="method-total method-balance">
                  <small>Saldo de hoy</small>
                  <strong
                    className={
                      new Decimal(balances[m.id]).isNegative() ? "negative" : ""
                    }
                  >
                    {money(balances[m.id], coin(m.currency))}
                  </strong>
                </div>
              )}
              {closing ? (
                <dl className="method-upcoming statement">
                  {[month, shiftMonth(month, 1)].map((period, i) => {
                    const dates = statementDates(period, closing, m.due_day ?? null);
                    return (
                      <div key={period} className={i ? "" : "method-pending"}>
                        <dt>
                          Resumen de {monthName(period).toLowerCase()}
                          <small>
                            Cierra el {shortDate(dates.closes)}
                            {dates.due
                              ? ` · vence el ${shortDate(dates.due)}`
                              : ""}
                          </small>
                        </dt>
                        <dd>{money(total(statement(period)), currency)}</dd>
                      </div>
                    );
                  })}
                  <div>
                    <dt>
                      Resúmenes posteriores
                      <small>Cuotas y compras ya cargadas</small>
                    </dt>
                    <dd>
                      {money(
                        total(
                          mine.filter(
                            (r) =>
                              statementMonth(r.date, closing) >
                              shiftMonth(month, 1),
                          ),
                        ),
                        currency,
                      )}
                    </dd>
                  </div>
                </dl>
              ) : (
                <>
                  <div className="method-total">
                    <small>
                      Gastado en {monthName(month).toLowerCase()} ·{" "}
                      {current.length}{" "}
                      {current.length === 1 ? "movimiento" : "movimientos"}
                    </small>
                    <strong>{money(total(current), currency)}</strong>
                  </div>
                  {later.length > 0 ? (
                    <dl className="method-upcoming">
                      {next.map((period) => (
                        <div key={period}>
                          <dt>{monthName(period)}</dt>
                          <dd>
                            {money(
                              total(
                                later.filter((r) => r.date.startsWith(period)),
                              ),
                              currency,
                            )}
                          </dd>
                        </div>
                      ))}
                      <div className="method-pending">
                        <dt>
                          Total ya comprometido
                          <small>
                            {later.length}{" "}
                            {later.length === 1
                              ? "pago futuro"
                              : "pagos futuros"}
                          </small>
                        </dt>
                        <dd>{money(total(later), currency)}</dd>
                      </div>
                    </dl>
                  ) : (
                    <p className="help">
                      {m.kind === "credit" && accountsEnabled
                        ? "Editá la tarjeta y cargá su día de cierre para ver cada resumen."
                        : "Sin cuotas ni gastos futuros cargados."}
                    </p>
                  )}
                </>
              )}
            </section>
          );
        })}
      </div>
      {unassigned.length > 0 && (
        <p className="help">
          Además, {money(total(unassigned), currency)} en{" "}
          {unassigned.length === 1
            ? "1 gasto"
            : `${unassigned.length} gastos`}{" "}
          de {monthName(month).toLowerCase()} sin medio de pago asignado.
        </p>
      )}
      {monthTransfers.length > 0 && (
        <section className="card transfers">
          <div className="section-heading">
            <div>
              <h2>Transferencias de {monthName(month).toLowerCase()}</h2>
              <p>No cuentan como gasto ni como ingreso.</p>
            </div>
          </div>
          {monthTransfers.map((t) => {
            const from = methods.find((m) => m.id === t.from_method_id);
            return (
              <div className="transfer-row" key={t.id}>
                <span className="grow">
                  <strong>
                    {name(t.from_method_id)} <ArrowRight size={14} />{" "}
                    {name(t.to_method_id)}
                  </strong>
                  <small>
                    {t.date.split("-").reverse().join("/")}
                    {t.note ? ` · ${t.note}` : ""}
                  </small>
                </span>
                <strong>{money(t.amount, coin(from?.currency))}</strong>
                <button
                  className="icon-button"
                  aria-label="Eliminar transferencia"
                  disabled={busy}
                  onClick={() => removeTransfer(t)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })}
        </section>
      )}
      {quick && (
        <div className="list-tools">
          <span className="help">Agregar rápido:</span>
          {quick}
        </div>
      )}
    </>
  );
}

export function MethodForm({
  item,
  currencies,
  accountsEnabled,
  busy,
  submit,
  remove,
}: {
  item?: PaymentMethod;
  currencies: Currency[];
  accountsEnabled: boolean;
  busy: boolean;
  submit: (form: FormData) => void;
  remove: (item: PaymentMethod) => void;
}) {
  const [kind, setKind] = useState<string>(item?.kind || "wallet"),
    [code, setCode] = useState(item?.currency || currencies[0]?.code || ""),
    [tracks, setTracks] = useState(item?.opening_balance != null);
  const decimals = currencies.find((c) => c.code === code)?.decimals ?? 2;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(new FormData(e.currentTarget));
      }}
    >
      <label>
        Nombre
        <input
          autoFocus={!item}
          name="name"
          required
          maxLength={60}
          defaultValue={item?.name}
          placeholder="Ej. Mercado Pago, Visa Galicia, Efectivo"
        />
      </label>
      <label>
        Tipo
        <select
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          {Object.entries(methodKinds).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {accountsEnabled && kind === "credit" && (
        <>
          <div className="form-grid">
            <label>
              Día de cierre
              <input
                name="closing_day"
                type="number"
                inputMode="numeric"
                min={1}
                max={31}
                placeholder="Ej. 25"
                defaultValue={item?.closing_day ?? ""}
              />
            </label>
            <label>
              Día de vencimiento
              <input
                name="due_day"
                type="number"
                inputMode="numeric"
                min={1}
                max={31}
                placeholder="Ej. 5"
                defaultValue={item?.due_day ?? ""}
              />
            </label>
          </div>
          <p className="help">
            Opcionales. Con el día de cierre, cada compra se suma al resumen que
            le corresponde: lo comprado después del cierre pasa al mes
            siguiente. Si tu tarjeta cambia de fecha, poné la habitual.
          </p>
        </>
      )}
      {accountsEnabled && kind !== "credit" && (
        <>
          <label>
            Moneda de la cuenta
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
          <label className="checkbox">
            <input
              name="tracks_balance"
              type="checkbox"
              checked={tracks}
              onChange={(e) => setTracks(e.target.checked)}
            />
            Llevar el saldo de esta cuenta
          </label>
          {tracks && (
            <>
              <div className="form-grid">
                <label>
                  Saldo inicial
                  <input
                    name="opening_balance"
                    inputMode="decimal"
                    autoComplete="off"
                    required
                    placeholder="0,00"
                    defaultValue={
                      item?.opening_balance != null
                        ? (item.opening_balance.startsWith("-") ? "-" : "") +
                          storedAmountInput(item.opening_balance, decimals)
                        : ""
                    }
                    onBlur={(e) => {
                      if (!/^\s*[-−]/.test(e.target.value))
                        e.target.value =
                          amountInput(e.target.value, decimals) || "";
                    }}
                  />
                </label>
                <label>
                  Al día
                  <input
                    name="balance_date"
                    type="date"
                    required
                    defaultValue={item?.balance_date || today()}
                  />
                </label>
              </div>
              <p className="help">
                Poné la plata que tenías ese día. Desde ahí el saldo se mueve
                solo con los gastos, ingresos y transferencias que cargues con
                esta cuenta, en su moneda.
              </p>
            </>
          )}
        </>
      )}
      {item && (
        <label className="checkbox">
          <input name="active" type="checkbox" defaultChecked={item.active} />
          Activo (se ofrece al cargar movimientos)
        </label>
      )}
      <p className="help">
        Es solo una etiqueta para tus movimientos: no se piden números de
        tarjeta, claves ni accesos, y no se conecta con ninguna cuenta.
      </p>
      <button disabled={busy} className="primary full">
        {busy ? "Guardando…" : "Guardar medio de pago"}
      </button>
      {item && (
        <button
          type="button"
          disabled={busy}
          className="danger-link full"
          onClick={() => remove(item)}
        >
          Eliminar medio de pago
        </button>
      )}
    </form>
  );
}

export function TransferForm({
  methods,
  currencies,
  busy,
  submit,
}: {
  methods: PaymentMethod[];
  currencies: Currency[];
  busy: boolean;
  submit: (form: FormData) => void;
}) {
  // El origen es una cuenta con moneda; el destino, otra de la misma moneda o una tarjeta a pagar.
  const sources = methods.filter(
    (m) => m.active && m.kind !== "credit" && m.currency,
  );
  const [fromId, setFromId] = useState(sources[0]?.id ?? "");
  const from = sources.find((m) => m.id === fromId);
  const targets = methods.filter(
    (m) =>
      m.active &&
      m.id !== fromId &&
      (m.kind === "credit" || m.currency === from?.currency),
  );
  const decimals =
    currencies.find((c) => c.code === from?.currency)?.decimals ?? 2;
  if (!sources.length)
    return (
      <p className="help">
        Primero editá una cuenta (no tarjeta de crédito) y elegí su moneda.
      </p>
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(new FormData(e.currentTarget));
      }}
    >
      <label>
        Importe{from?.currency ? ` (${from.currency})` : ""}
        <input
          autoFocus
          className="amount-input"
          name="amount"
          inputMode="decimal"
          autoComplete="off"
          required
          placeholder="0,00"
          onBlur={(e) => {
            e.target.value = amountInput(e.target.value, decimals);
          }}
        />
      </label>
      <div className="form-grid">
        <label>
          Desde
          <select
            name="from_method_id"
            value={fromId}
            onChange={(e) => setFromId(e.target.value)}
          >
            {sources.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Hacia
          <select name="to_method_id" required key={fromId} defaultValue="">
            <option value="" disabled>
              Elegí el destino
            </option>
            {targets.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.kind === "credit" ? " (pago de tarjeta)" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Fecha
        <input name="date" type="date" required defaultValue={today()} />
      </label>
      <label>
        Nota (opcional)
        <input name="note" maxLength={200} />
      </label>
      <p className="help">
        Una transferencia mueve plata entre tus cuentas sin contarla como gasto.
        Pagar la tarjeta también va acá: las compras ya figuran como gastos en
        su fecha.
      </p>
      <button disabled={busy} className="primary full">
        {busy ? "Guardando…" : "Guardar transferencia"}
      </button>
    </form>
  );
}
