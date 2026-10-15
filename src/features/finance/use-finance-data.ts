"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Family, FamilyMember } from "@/features/family/family-panel";
import { errorText } from "@/lib/errors";
import { supabase } from "@/lib/supabase";
import { newMovements, movementFields } from "@/features/movements/build";
import type { ImportedMovement } from "@/features/movements/csv";
import {
  type QueuedMovement,
  isNetworkError,
  isOffline,
  readQueue,
  readSnapshot,
  writeQueue,
  writeSnapshot,
} from "@/features/offline/store";
import {
  type Budget,
  type Category,
  type Movement,
  type PaymentMethod,
  type Transfer,
  initialCurrencies,
  parseAmount,
  parseBalance,
  today,
} from "./model";

export type Notice = { text: string; undo?: () => void } | null;
type Table =
  | "movements"
  | "budgets"
  | "categories"
  | "payment_methods"
  | "transfers";
// Gastos futuros ya cargados con un medio de pago (cuotas pendientes, por ejemplo).
export type Upcoming = Pick<
  Movement,
  "id" | "date" | "amount" | "currency" | "kind" | "payment_method_id"
>;
type Pending = { timer: ReturnType<typeof setTimeout>; commit: () => Promise<void> };

const categoryColumns = "id,name,color,kind,active";
const budgetColumns = "id,month,category_id,currency,amount:amount_text";
const basicColumns = "id,name,kind,active";
// Con la migración de cuentas: cierre de tarjeta y saldo.
const accountColumns =
  basicColumns +
  ",closing_day,due_day,currency,opening_balance:opening_balance_text,balance_date";
const transferColumns =
  "id,user_id,date,from_method_id,to_method_id,amount:amount_text,note";
const missingTable = ["42P01", "PGRST205"];
const missingColumn = ["42703", "PGRST204"];
async function loadBalances(space: string | null) {
  const { data, error } = await supabase!.rpc("payment_balances", {
    space,
    today: today(),
  });
  if (error) throw error;
  return Object.fromEntries(
    (Array.isArray(data) ? data : []).map(
      (r: { method_id: string; balance: string }) => [r.method_id, r.balance],
    ),
  ) as Record<string, string>;
}
const sortMethods = (list: PaymentMethod[]) =>
  [...list].sort((a, b) => a.name.localeCompare(b.name, "es"));
const undoMs = 6000;
// Colores para las categorías creadas desde el formulario de movimientos; se pueden cambiar después.
const newCategoryColors = [
  "#2f7ed8",
  "#d9534f",
  "#e8a139",
  "#8b77bb",
  "#3aa6a0",
  "#c0568f",
  "#6b8e23",
  "#bf975b",
  "#5b6abf",
  "#64748b",
];
const sortCategories = (list: Category[]) =>
  [...list].sort((a, b) => a.name.localeCompare(b.name, "es"));
const merge = <T extends { id: string }>(current: T[], incoming: T[]) => {
  const ids = new Set(incoming.map((x) => x.id));
  return [...current.filter((x) => !ids.has(x.id)), ...incoming];
};

// Estado y operaciones del espacio de finanzas activo (personal o familiar).
// Carga el año visible más diciembre anterior, para comparar enero con el mes previo.
export function useFinanceData(userId: string | null, year: string) {
  const [family, setFamily] = useState<Family | null>(null),
    [members, setMembers] = useState<FamilyMember[]>([]),
    [familyEnabled, setFamilyEnabled] = useState(false),
    [preferPersonal, setPreferPersonal] = useState(false),
    [activeFamilyId, setActiveFamilyId] = useState<string | null>(null),
    [dataReady, setDataReady] = useState(false);
  const [rows, setRows] = useState<Movement[]>([]),
    [categories, setCategories] = useState<Category[]>([]),
    [budgets, setBudgets] = useState<Budget[]>([]),
    [currencies, setCurrencies] = useState(initialCurrencies),
    [methods, setMethods] = useState<PaymentMethod[]>([]),
    [upcoming, setUpcoming] = useState<Upcoming[]>([]),
    [paymentsEnabled, setPaymentsEnabled] = useState(false),
    [accountsEnabled, setAccountsEnabled] = useState(false),
    [transfers, setTransfers] = useState<Transfer[]>([]),
    [balances, setBalances] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [loadError, setLoadError] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState<Notice>(null),
    [offline, setOffline] = useState(false),
    [queue, setQueue] = useState<QueuedMovement[]>([]);
  const generation = useRef(0);
  const loud = useRef(0);
  const currentUser = useRef<string | null>(userId);
  const pending = useRef<Pending | null>(null);
  const hidden = useRef(new Set<string>());
  const flushing = useRef(false);
  const movementColumns =
    "id,user_id,date,name,amount:amount_text,currency,kind,category_id,note,receipt_path,created_at" +
    (familyEnabled ? ",reference" : "") +
    (paymentsEnabled ? ",payment_method_id" : "");
  const scope = { familyEnabled, familyId: activeFamilyId, paymentsEnabled };

  const refresh = useCallback(
    async (silent = false) => {
      const uid = currentUser.current;
      if (!supabase || !uid) return;
      // Una actualización en segundo plano no interrumpe una carga visible en curso.
      if (silent && loud.current) return;
      const gen = ++generation.current;
      if (!silent) {
        loud.current = gen;
        setLoading(true);
        setLoadError("");
      }
      try {
        const familyResult = await supabase
          .from("families")
          .select("id,name,owner_id")
          .maybeSingle();
        const missingSchema =
          familyResult.error &&
          ["42P01", "PGRST205"].includes(familyResult.error.code);
        if (familyResult.error && !missingSchema) throw familyResult.error;
        const nextFamily = (familyResult.data as Family | null) ?? null;
        const enabled = !missingSchema;
        // La disponibilidad de familias no depende de las columnas de movimientos.
        if (gen === generation.current) setFamilyEnabled(enabled);
        const scope = !preferPersonal && nextFamily ? nextFamily.id : null;
        const memberResult = nextFamily
          ? await supabase
              .from("family_members")
              .select("user_id,family_id,display_name")
              .eq("family_id", nextFamily.id)
          : { data: [], error: null };
        if (memberResult.error) throw memberResult.error;
        const from = `${Number(year) - 1}-12-01`,
          to = `${year}-12-31`;
        // Paginar evita el límite predeterminado de 1.000 filas de PostgREST.
        async function all(table: Table, columns: string, dateColumn?: string) {
          const result: unknown[] = [];
          for (let offset = 0; ; offset += 500) {
            let query = supabase!.from(table).select(columns).order("id");
            if (enabled)
              query = scope
                ? query.eq("family_id", scope)
                : query.is("family_id", null);
            if (dateColumn)
              query = query.gte(dateColumn, from).lte(dateColumn, to);
            const { data, error } = await query.range(offset, offset + 499);
            if (error) throw error;
            result.push(...data);
            if (data.length < 500) break;
          }
          return result;
        }
        // Sin la migración de medios de pago, la app sigue funcionando sin esa función.
        let payments = enabled,
          pm: unknown[] = [],
          later: Upcoming[] = [];
        let accounts = payments,
          moved: unknown[] = [],
          saldo: Record<string, string> = {};
        if (payments)
          try {
            pm = await all("payment_methods", accountColumns);
          } catch (e) {
            const code = (e as { code?: string }).code ?? "";
            accounts = false;
            if (missingColumn.includes(code))
              pm = await all("payment_methods", basicColumns);
            else if (missingTable.includes(code)) payments = false;
            else throw e;
          }
        if (accounts)
          [moved, saldo] = await Promise.all([
            all("transfers", transferColumns, "date"),
            loadBalances(scope),
          ]);
        if (payments) {
          let query = supabase
            .from("movements")
            .select("id,date,amount:amount_text,currency,kind,payment_method_id")
            .gt("date", to)
            .not("payment_method_id", "is", null);
          query = scope
            ? query.eq("family_id", scope)
            : query.is("family_id", null);
          const { data, error } = await query.order("date").limit(1000);
          if (error) throw error;
          later = data as Upcoming[];
        }
        const [m, c, b, cur] = await Promise.all([
          all(
            "movements",
            "id,user_id,date,name,amount:amount_text,currency,kind,category_id,note,receipt_path,created_at" +
              (enabled ? ",reference" : "") +
              (payments ? ",payment_method_id" : ""),
            "date",
          ),
          all("categories", categoryColumns),
          all("budgets", budgetColumns, "month"),
          supabase.from("currencies").select("*").order("code"),
        ]);
        if (cur.error) throw cur.error;
        if (gen !== generation.current) return;
        const visible = <T extends { id: string }>(list: unknown[]) =>
          (list as T[]).filter((x) => !hidden.current.has(x.id));
        const nextCategories = sortCategories(visible<Category>(c));
        setFamily(nextFamily);
        setMembers((memberResult.data ?? []) as FamilyMember[]);
        setFamilyEnabled(enabled);
        setActiveFamilyId(scope);
        setRows(visible<Movement>(m));
        setCategories(nextCategories);
        setBudgets(visible<Budget>(b));
        setCurrencies(cur.data);
        const nextMethods = sortMethods(visible<PaymentMethod>(pm));
        setMethods(nextMethods);
        setUpcoming(later);
        setPaymentsEnabled(payments);
        setAccountsEnabled(accounts);
        setTransfers(visible<Transfer>(moved));
        setBalances(saldo);
        setDataReady(true);
        setOffline(false);
        setQueue(readQueue(uid));
        writeSnapshot(uid, {
          categories: nextCategories,
          currencies: cur.data,
          familyEnabled: enabled,
          familyId: scope,
          familyName: scope ? nextFamily!.name : null,
          paymentsEnabled: payments,
          methods: nextMethods,
        });
      } catch (e) {
        // Si falla una actualización en segundo plano, se conserva lo que ya está en pantalla.
        if (gen !== generation.current || silent) return;
        if (isNetworkError(e) && readSnapshot(uid)) {
          setOffline(true);
          return;
        }
        const failure = e as { code?: string; message?: string };
        setLoadError(
          ["42703", "PGRST204"].includes(failure.code ?? "") &&
            /reference/i.test(failure.message ?? "")
            ? "Falta el campo Referencia. Ejecutá 202609280003_reference_repair.sql en Supabase y tocá Reintentar carga. No repitas la migración de familias."
            : isNetworkError(e)
              ? "No hay conexión. Revisá tu red y tocá Reintentar carga."
              : errorText(e),
        );
        setRows([]);
        setCategories([]);
        setBudgets([]);
        setMethods([]);
        setTransfers([]);
        setBalances({});
        setUpcoming([]);
        setDataReady(false);
      } finally {
        if (loud.current === gen) loud.current = 0;
        if (gen === generation.current) setLoading(false);
      }
    },
    [preferPersonal, year],
  );

  // Se llama al cambiar la sesión: nada de la cuenta anterior queda en memoria.
  const reset = useCallback((nextUserId: string | null) => {
    void pending.current?.commit();
    currentUser.current = nextUserId;
    generation.current++;
    loud.current = 0;
    hidden.current.clear();
    setRows([]);
    setCategories([]);
    setBudgets([]);
    setMethods([]);
    setTransfers([]);
    setBalances({});
    setUpcoming([]);
    setNotice(null);
    setError("");
    setLoadError("");
    setFamily(null);
    setMembers([]);
    setActiveFamilyId(null);
    setDataReady(false);
    setOffline(false);
    setPreferPersonal(false);
    setQueue(nextUserId ? readQueue(nextUserId) : []);
  }, []);

  useEffect(() => {
    if (userId) void refresh();
  }, [userId, refresh]);

  function changeSpace(personal: boolean) {
    void pending.current?.commit();
    generation.current++;
    loud.current = 0;
    setRows([]);
    setCategories([]);
    setBudgets([]);
    setMethods([]);
    setTransfers([]);
    setBalances({});
    setUpcoming([]);
    setLoading(true);
    setDataReady(false);
    setPreferPersonal(personal);
  }

  // Los saldos los calcula el servidor: se vuelven a pedir después de cada cambio que los mueve.
  async function refreshBalances() {
    if (!accountsEnabled) return;
    try {
      setBalances(await loadBalances(activeFamilyId));
    } catch {}
  }

  async function operation(
    fn: () => Promise<void | string>,
    done = "Cambios guardados.",
  ) {
    if (busy || loading || !dataReady) return false;
    const owner = currentUser.current;
    setBusy(true);
    setError("");
    setNotice(null);
    try {
      const message = await fn();
      if (currentUser.current !== owner) return false;
      setNotice({ text: message || done });
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  // Aplica en pantalla lo que devolvió el servidor; si no devolvió filas, vuelve a consultar.
  async function apply<T extends { id: string }>(
    data: unknown,
    update: (rows: T[]) => void,
  ) {
    if (Array.isArray(data) && data.length) update(data as T[]);
    else await refresh(true);
  }

  function enqueue(items: QueuedMovement[]) {
    const uid = currentUser.current!;
    const next = [...readQueue(uid), ...items];
    writeQueue(uid, next);
    setQueue(next);
    return items.length === 1
      ? "Sin conexión: el movimiento quedó guardado en este dispositivo y se sincroniza cuando vuelva la red."
      : `Sin conexión: ${items.length} movimientos quedaron guardados en este dispositivo y se sincronizan cuando vuelva la red.`;
  }

  const flushQueue = useCallback(
    async (retryFailed = false) => {
      const uid = currentUser.current;
      if (!supabase || !uid || flushing.current) return;
      flushing.current = true;
      try {
        let items = readQueue(uid),
          sent = 0,
          changed = false;
        for (const item of [...items]) {
          if (item.error && !retryFailed) continue;
          const payload = { ...item };
          delete payload.error;
          const { error } = await supabase.from("movements").insert(payload);
          if (error && isNetworkError(error)) break;
          // 23505: el alta anterior sí llegó aunque se haya perdido la respuesta.
          if (!error || error.code === "23505") {
            items = items.filter((i) => i.id !== item.id);
            sent++;
          } else
            items = items.map((i) =>
              i.id === item.id ? { ...i, error: errorText(error) } : i,
            );
          changed = true;
          writeQueue(uid, items);
        }
        if (currentUser.current !== uid || !changed) return;
        setQueue(items);
        if (sent) {
          await refresh(true);
          setNotice({
            text:
              sent === 1
                ? "Se sincronizó 1 movimiento pendiente."
                : `Se sincronizaron ${sent} movimientos pendientes.`,
          });
        }
      } finally {
        flushing.current = false;
      }
    },
    [refresh],
  );
  useEffect(() => {
    if (dataReady && !offline && !isOffline() && queue.some((q) => !q.error))
      void flushQueue();
  }, [dataReady, offline, queue, flushQueue]);
  function discardQueue() {
    const uid = currentUser.current;
    if (!uid) return;
    writeQueue(uid, []);
    setQueue([]);
  }

  // Al volver a la app o recuperar la red se actualiza sin vaciar la pantalla.
  useEffect(() => {
    if (!userId) return;
    const onFocus = () => {
      if (!busy) void refresh(true);
    };
    const onOnline = () => void (offline ? refresh() : flushQueue());
    const onHide = () => void pending.current?.commit();
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pagehide", onHide);
    };
  }, [userId, busy, offline, refresh, flushQueue]);

  // Cambios de otros integrantes en tiempo real. Las bajas no admiten filtro por grupo:
  // esas llegan con la actualización al volver a la app.
  useEffect(() => {
    if (!supabase || !userId || !activeFamilyId) return;
    const client = supabase;
    let timer: ReturnType<typeof setTimeout>;
    const changed = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(true), 600);
    };
    const channel = client.channel(`family-${activeFamilyId}`);
    for (const table of ["movements", "categories", "budgets"])
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `family_id=eq.${activeFamilyId}`,
        },
        changed,
      );
    channel.subscribe();
    return () => {
      clearTimeout(timer);
      void client.removeChannel(channel);
    };
  }, [userId, activeFamilyId, refresh]);

  // Oculta el registro de inmediato y lo borra del servidor pasado el plazo para deshacer.
  function deferDelete(options: {
    table: Table;
    id: string;
    label: string;
    hide: () => void;
    restore: () => void;
    after?: () => Promise<string | void>;
  }) {
    if (busy || loading || !dataReady) return false;
    void pending.current?.commit();
    const owner = currentUser.current;
    const settle = () => {
      clearTimeout(entry.timer);
      if (pending.current === entry) pending.current = null;
    };
    const undo = () => {
      settle();
      hidden.current.delete(options.id);
      options.restore();
      setNotice(null);
    };
    const entry: Pending = {
      timer: setTimeout(() => void entry.commit(), undoMs),
      commit: async () => {
        settle();
        const { error } = await supabase!
          .from(options.table)
          .delete()
          .eq("id", options.id);
        hidden.current.delete(options.id);
        if (currentUser.current !== owner) return;
        if (error) {
          options.restore();
          setNotice((n) => (n?.undo === undo ? null : n));
          setError(
            isNetworkError(error)
              ? "Sin conexión: no se pudo eliminar. Reintentá cuando vuelva la red."
              : errorText(error),
          );
          return;
        }
        const warning = await options.after?.();
        setNotice((n) =>
          n?.undo === undo ? (warning ? { text: warning } : null) : n,
        );
      },
    };
    pending.current = entry;
    hidden.current.add(options.id);
    options.hide();
    setError("");
    setNotice({ text: options.label, undo });
    return true;
  }
  const flushPending = () => pending.current?.commit() ?? Promise.resolve();

  function removeMovement(item: Movement) {
    return deferDelete({
      table: "movements",
      id: item.id,
      label: `Se eliminó “${item.name}”.`,
      hide: () => setRows((list) => list.filter((r) => r.id !== item.id)),
      restore: () => setRows((list) => merge(list, [item])),
      after: async () => {
        await refreshBalances();
        if (!item.receipt_path) return;
        const result = await supabase!.storage
          .from("receipts")
          .remove([item.receipt_path]);
        if (result.error)
          return "Movimiento eliminado. No se pudo quitar el archivo del ticket del almacenamiento; permanece privado.";
      },
    });
  }
  function removeBudget(item: Budget) {
    return deferDelete({
      table: "budgets",
      id: item.id,
      label: "Se eliminó el presupuesto.",
      hide: () => setBudgets((list) => list.filter((b) => b.id !== item.id)),
      restore: () => setBudgets((list) => merge(list, [item])),
    });
  }
  function removeCategory(item: Category) {
    return deferDelete({
      table: "categories",
      id: item.id,
      label: `Se eliminó la categoría “${item.name}”.`,
      hide: () => setCategories((list) => list.filter((c) => c.id !== item.id)),
      restore: () =>
        setCategories((list) => sortCategories(merge(list, [item]))),
    });
  }

  // Si en el formulario se escribió una categoría nueva, la crea y la deja elegida.
  async function ensureCategory(f: FormData) {
    const name = String(f.get("category_new") ?? "").trim();
    if (!name) return;
    const kind = String(f.get("kind"));
    const existing = categories.find(
      (c) =>
        c.kind === kind &&
        c.name.toLocaleLowerCase("es") === name.toLocaleLowerCase("es"),
    );
    if (existing && !existing.active)
      throw new Error(
        `La categoría “${existing.name}” está desactivada. Activala desde Categorías.`,
      );
    if (existing) return f.set("category_id", existing.id);
    if (isOffline())
      throw new Error(
        "Sin conexión no se pueden crear categorías. Elegí una existente.",
      );
    const { data, error } = await supabase!
      .from("categories")
      .insert({
        name,
        kind,
        color:
          newCategoryColors.find(
            (color) => !categories.some((c) => c.color === color),
          ) ?? newCategoryColors[categories.length % newCategoryColors.length],
        ...(familyEnabled ? { family_id: activeFamilyId } : {}),
      })
      .select(categoryColumns);
    if (error)
      throw isNetworkError(error)
        ? new Error(
            "Sin conexión no se pueden crear categorías. Elegí una existente.",
          )
        : error;
    const created = (data as Category[] | null)?.[0];
    if (!created) throw new Error("No se pudo crear la categoría.");
    setCategories((list) => sortCategories(merge(list, [created])));
    f.set("category_id", created.id);
  }

  function saveMovement(f: FormData, old?: Movement) {
    return operation(async () => {
      await ensureCategory(f);
      if (old) {
        const fields = movementFields(f, currencies, scope);
        const path = fields.kind === "expense" ? (old.receipt_path ?? null) : null;
        const { data, error } = await supabase!
          .from("movements")
          .update({ ...fields, receipt_path: path })
          .eq("id", old.id)
          .select(movementColumns);
        if (error) throw error;
        await apply<Movement>(data, (saved) =>
          setRows((list) => merge(list, saved)),
        );
        await refreshBalances();
        if (old.receipt_path && old.receipt_path !== path) {
          const cleanup = await supabase!.storage
            .from("receipts")
            .remove([old.receipt_path]);
          if (cleanup.error)
            return "Movimiento guardado, pero no se pudo borrar el ticket anterior del almacenamiento. Permanece privado.";
        }
        return;
      }
      const series = newMovements(f, currencies, scope);
      if (isOffline()) return enqueue(series);
      const { data, error } = await supabase!
        .from("movements")
        .insert(series)
        .select(movementColumns);
      if (error) {
        if (isNetworkError(error)) return enqueue(series);
        throw error;
      }
      await apply<Movement>(data, (saved) =>
        setRows((list) => merge(list, saved)),
      );
      await refreshBalances();
      // Las cuotas que caen después del año cargado cuentan como pendientes del medio de pago.
      if (series.some((m) => m.payment_method_id && m.date.slice(0, 4) > year))
        void refresh(true);
      if (series.length > 1)
        return `Se cargaron ${series.length} movimientos, uno por mes.`;
    });
  }

  function saveMethod(f: FormData, old?: PaymentMethod) {
    return operation(async () => {
      const kind = String(f.get("kind"));
      const day = (field: string) => {
        const text = String(f.get(field) ?? "").trim();
        if (!text) return null;
        const value = Number(text);
        if (!Number.isInteger(value) || value < 1 || value > 31)
          throw new Error("Los días van del 1 al 31.");
        return value;
      };
      const code = String(f.get("currency") ?? "");
      const tracks = kind !== "credit" && f.get("tracks_balance") === "on";
      const payload = {
        name: String(f.get("name") ?? "").trim(),
        kind,
        active: old ? f.get("active") === "on" : true,
        ...(accountsEnabled
          ? {
              closing_day: kind === "credit" ? day("closing_day") : null,
              due_day: kind === "credit" ? day("due_day") : null,
              currency: kind !== "credit" && code ? code : null,
              opening_balance: tracks
                ? parseBalance(
                    String(f.get("opening_balance") ?? ""),
                    currencies.find((c) => c.code === code)?.decimals,
                  )
                : null,
              balance_date: tracks ? String(f.get("balance_date")) : null,
            }
          : {}),
      };
      if (!payload.name) throw new Error("Ingresá un nombre.");
      if (tracks && (!code || !payload.balance_date))
        throw new Error("Para llevar el saldo indicá moneda y fecha.");
      const methodColumns = accountsEnabled ? accountColumns : basicColumns;
      const { data, error } = old
        ? await supabase!
            .from("payment_methods")
            .update(payload)
            .eq("id", old.id)
            .select(methodColumns)
        : await supabase!
            .from("payment_methods")
            .insert({ ...payload, family_id: activeFamilyId })
            .select(methodColumns);
      if (error) throw error;
      await apply<PaymentMethod>(data, (saved) =>
        setMethods((list) => sortMethods(merge(list, saved))),
      );
      await refreshBalances();
    });
  }
  function saveTransfer(f: FormData) {
    return operation(async () => {
      const from = methods.find((m) => m.id === f.get("from_method_id"));
      const to = methods.find((m) => m.id === f.get("to_method_id"));
      if (!from || !to) throw new Error("Elegí origen y destino.");
      const { data, error } = await supabase!
        .from("transfers")
        .insert({
          family_id: activeFamilyId,
          date: String(f.get("date")),
          from_method_id: from.id,
          to_method_id: to.id,
          amount: parseAmount(
            String(f.get("amount")),
            currencies.find((c) => c.code === from.currency)?.decimals,
          ),
          note: String(f.get("note") ?? "").trim(),
        })
        .select(transferColumns);
      if (error) throw error;
      await apply<Transfer>(data, (saved) =>
        setTransfers((list) => merge(list, saved)),
      );
      await refreshBalances();
      return to.kind === "credit"
        ? "Pago de tarjeta registrado."
        : "Transferencia registrada.";
    });
  }
  function removeTransfer(item: Transfer) {
    return deferDelete({
      table: "transfers",
      id: item.id,
      label: "Se eliminó la transferencia.",
      hide: () => setTransfers((list) => list.filter((t) => t.id !== item.id)),
      restore: () => setTransfers((list) => merge(list, [item])),
      after: refreshBalances,
    });
  }
  function removeMethod(item: PaymentMethod) {
    return deferDelete({
      table: "payment_methods",
      id: item.id,
      label: `Se eliminó “${item.name}”. Sus movimientos quedan sin medio de pago.`,
      hide: () => setMethods((list) => list.filter((m) => m.id !== item.id)),
      restore: () => setMethods((list) => sortMethods(merge(list, [item]))),
      after: async () => void (await refresh(true)),
    });
  }

  function saveCategory(f: FormData, old?: Category) {
    return operation(async () => {
      const payload = {
        ...(!old && familyEnabled ? { family_id: activeFamilyId } : {}),
        name: String(f.get("name")).trim(),
        color: String(f.get("color")),
        kind: String(f.get("kind")),
        active: f.get("active") === "on",
      };
      if (!payload.name) throw new Error("Ingresá un nombre.");
      const { data, error } = old
        ? await supabase!
            .from("categories")
            .update(payload)
            .eq("id", old.id)
            .select(categoryColumns)
        : await supabase!
            .from("categories")
            .insert(payload)
            .select(categoryColumns);
      if (error) throw error;
      await apply<Category>(data, (saved) =>
        setCategories((list) => sortCategories(merge(list, saved))),
      );
    });
  }

  function saveBudget(f: FormData, old?: Budget) {
    return operation(async () => {
      const code = String(f.get("currency"));
      const payload = {
        month: String(f.get("month")) + "-01",
        currency: code,
        category_id: String(f.get("category_id")),
        amount: parseAmount(
          String(f.get("amount")),
          currencies.find((c) => c.code === code)!.decimals,
        ),
      };
      const existing =
        old ??
        budgets.find(
          (b) =>
            b.month === payload.month &&
            b.category_id === payload.category_id &&
            b.currency === payload.currency,
        );
      const { data, error } = existing
        ? await supabase!
            .from("budgets")
            .update(payload)
            .eq("id", existing.id)
            .select(budgetColumns)
        : await supabase!
            .from("budgets")
            .insert({
              ...payload,
              ...(familyEnabled ? { family_id: activeFamilyId } : {}),
            })
            .select(budgetColumns);
      if (error) throw error;
      await apply<Budget>(data, (saved) =>
        setBudgets((list) => merge(list, saved)),
      );
    });
  }

  // Presupuestos de `from` que todavía no existen en `to` (misma moneda, categoría activa).
  function budgetsToCopy(from: string, to: string, currency: string) {
    return budgets.filter(
      (b) =>
        b.month.startsWith(from) &&
        b.currency === currency &&
        categories.find((c) => c.id === b.category_id)?.active &&
        !budgets.some(
          (x) =>
            x.month.startsWith(to) &&
            x.currency === currency &&
            x.category_id === b.category_id,
        ),
    );
  }
  function copyBudgets(from: string, to: string, currency: string) {
    return operation(async () => {
      const source = budgetsToCopy(from, to, currency);
      if (!source.length)
        throw new Error("No hay presupuestos para copiar de ese mes.");
      const { data, error } = await supabase!
        .from("budgets")
        .insert(
          source.map((b) => ({
            month: `${to}-01`,
            currency,
            category_id: b.category_id,
            amount: b.amount,
            ...(familyEnabled ? { family_id: activeFamilyId } : {}),
          })),
        )
        .select(budgetColumns);
      if (error) throw error;
      await apply<Budget>(data, (saved) =>
        setBudgets((list) => merge(list, saved)),
      );
      return source.length === 1
        ? "Se copió 1 presupuesto."
        : `Se copiaron ${source.length} presupuestos.`;
    });
  }

  // Crea las categorías que falten y carga los movimientos en tandas.
  function importMovements(items: ImportedMovement[]) {
    return operation(async () => {
      const same = (a: string, b: string) =>
        a.toLocaleLowerCase("es") === b.toLocaleLowerCase("es");
      const space = familyEnabled ? { family_id: activeFamilyId } : {};
      const wanted = (item: ImportedMovement) =>
        item.category || (item.kind === "expense" ? "Otros" : "");
      let known = categories;
      const missing: { name: string; kind: Movement["kind"] }[] = [];
      for (const item of items) {
        const name = wanted(item);
        if (!name) continue;
        const found = known.find(
          (c) => c.kind === item.kind && same(c.name, name),
        );
        if (found && !found.active)
          throw new Error(
            `La categoría “${found.name}” está desactivada. Activala o cambiá esas filas antes de importar.`,
          );
        if (
          !found &&
          !missing.some((c) => c.kind === item.kind && same(c.name, name))
        )
          missing.push({ name, kind: item.kind });
      }
      if (missing.length) {
        const { data, error } = await supabase!
          .from("categories")
          .insert(missing.map((c) => ({ ...c, ...space, color: "#7c8798" })))
          .select(categoryColumns);
        if (error) throw error;
        if (!data?.length)
          throw new Error("No se pudieron crear las categorías nuevas.");
        known = [...known, ...(data as Category[])];
        setCategories(sortCategories(known));
      }
      const payload = items.map((item) => {
        const name = wanted(item);
        return {
          id: crypto.randomUUID(),
          ...space,
          date: item.date,
          name: item.name,
          kind: item.kind,
          amount: item.amount,
          currency: item.currency,
          category_id: name
            ? known.find((c) => c.kind === item.kind && same(c.name, name))!.id
            : null,
          note: item.note,
          ...(familyEnabled ? { reference: item.reference } : {}),
          // Solo se asignan medios que ya existen y están activos; los demás se ignoran.
          ...(paymentsEnabled
            ? {
                payment_method_id:
                  methods.find((m) => m.active && same(m.name, item.method))
                    ?.id ?? null,
              }
            : {}),
        };
      });
      for (let done = 0; done < payload.length; done += 200) {
        const { error } = await supabase!
          .from("movements")
          .insert(payload.slice(done, done + 200));
        if (error) {
          await refresh(true);
          throw new Error(
            `Se importaron ${done} de ${payload.length} movimientos. ${errorText(error)}`,
          );
        }
      }
      await refresh(true);
      return payload.length === 1
        ? "Se importó 1 movimiento."
        : `Se importaron ${payload.length} movimientos.`;
    });
  }

  return {
    family,
    members,
    familyEnabled,
    preferPersonal,
    activeFamilyId,
    dataReady,
    rows,
    categories,
    budgets,
    currencies,
    methods,
    upcoming,
    paymentsEnabled,
    accountsEnabled,
    transfers,
    balances,
    busy,
    loading,
    loadError,
    error,
    notice,
    offline,
    queue,
    setError,
    setNotice,
    refresh,
    reset,
    changeSpace,
    saveMovement,
    saveCategory,
    saveBudget,
    copyBudgets,
    budgetsToCopy,
    importMovements,
    removeMovement,
    removeBudget,
    removeCategory,
    saveMethod,
    removeMethod,
    saveTransfer,
    removeTransfer,
    flushPending,
    flushQueue,
    discardQueue,
  };
}
export type FinanceData = ReturnType<typeof useFinanceData>;
