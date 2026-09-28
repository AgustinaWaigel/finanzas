"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import type { User } from "@supabase/supabase-js";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Plus,
  LayoutDashboard,
  ArrowLeftRight,
  ChartNoAxesCombined,
  Tags,
  Wallet,
  LogOut,
  ChevronRight,
  X,
  Menu,
  Check,
  Trash2,
  Pencil,
  Leaf,
  ShieldCheck,
  Users,
} from "lucide-react";
import {
  FamilyPanel,
  type Family,
  type FamilyMember,
} from "@/features/family/family-panel";
import { errorText } from "@/lib/errors";
import {
  pendingInvitation,
  invitationLink,
} from "@/features/family/invitation";
import { Empty, ModalShell } from "@/components/ui";
import { Auth } from "@/features/auth/auth-form";
import { AnnualOverview } from "@/features/reports/annual-overview";
import { Summary, Evolution, Distribution } from "@/features/reports/charts";
import { BudgetProgress } from "@/features/budgets/budget-progress";
import { MovementForm } from "@/features/movements/movement-form";
import { MovementDetail } from "@/features/movements/movement-detail";
import { supabase } from "@/lib/supabase";
import {
  type Category,
  type Movement,
  type Budget,
  type Currency,
  initialCurrencies,
  money,
  parseAmount,
  totals,
  sum,
  months,
  today,
} from "./model";
type Tab =
  | "Resumen"
  | "Movimientos"
  | "Presupuestos"
  | "Ver gastos"
  | "Categorías"
  | "Grupo Familiar";
type Modal =
  | { type: "movement"; item?: Movement; read?: boolean; expenseOnly?: boolean }
  | { type: "category"; item?: Category }
  | { type: "budget"; item?: Budget }
  | null;
const tabs = [
  { name: "Resumen", icon: LayoutDashboard },
  { name: "Movimientos", icon: ArrowLeftRight },
  { name: "Presupuestos", icon: Wallet },
  { name: "Ver gastos", icon: ChartNoAxesCombined },
  { name: "Categorías", icon: Tags },
  { name: "Grupo Familiar", icon: Users },
] as const;
export default function FinanceApp({
  initialExpense = false,
  summaryOnly = false,
}: {
  initialExpense?: boolean;
  summaryOnly?: boolean;
}) {
  const [family, setFamily] = useState<Family | null>(null),
    [members, setMembers] = useState<FamilyMember[]>([]),
    [familyEnabled, setFamilyEnabled] = useState(false),
    [preferPersonal, setPreferPersonal] = useState(false),
    [activeFamilyId, setActiveFamilyId] = useState<string | null>(null),
    [dataReady, setDataReady] = useState(false);
  const openedExpense = useRef<string | null>(null);
  const [user, setUser] = useState<User | null>(null),
    [authReady, setAuthReady] = useState(!supabase),
    [tab, setTab] = useState<Tab>("Resumen");
  const [rows, setRows] = useState<Movement[]>([]),
    [categories, setCategories] = useState<Category[]>([]),
    [budgets, setBudgets] = useState<Budget[]>([]),
    [currencies, setCurrencies] = useState(initialCurrencies);
  const [month, setMonth] = useState(today().slice(0, 7)),
    [currency, setCurrency] = useState("ARS"),
    [modal, setModal] = useState<Modal>(null),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [search, setSearch] = useState(""),
    [kindFilter, setKindFilter] = useState("all"),
    [memberFilter, setMemberFilter] = useState("all"),
    [mobileMenu, setMobileMenu] = useState(false);
  const current =
    currencies.find((c) => c.code === currency) || initialCurrencies[0];
  const year = month.slice(0, 4);
  const selected = rows.filter(
    (r) => r.date.startsWith(month) && r.currency === currency,
  );
  const summary = totals(rows, currency, month);
  const generation = useRef(0);
  const authenticatedUser = useRef<string | null>(null);
  const refresh = useCallback(async () => {
    if (!supabase) return;
    const gen = ++generation.current;
    setLoading(true);
    setError("");
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
      // Paginar evita el límite predeterminado de 1.000 filas de PostgREST.
      async function all(table: string, columns: string) {
        const result: unknown[] = [];
        for (let offset = 0; ; offset += 500) {
          let query = supabase!.from(table).select(columns).order("id");
          if (enabled)
            query = scope
              ? query.eq("family_id", scope)
              : query.is("family_id", null);
          const { data, error } = await query.range(offset, offset + 499);
          if (error) throw error;
          result.push(...data);
          if (data.length < 500) break;
        }
        return result;
      }
      const [m, c, b, cur] = await Promise.all([
        all(
          "movements",
          "id,user_id,date,name,amount:amount_text,currency,kind,category_id,note,receipt_path" +
            (enabled ? ",reference" : ""),
        ),
        all("categories", "id,name,color,kind,active"),
        all("budgets", "id,month,category_id,currency,amount:amount_text"),
        supabase.from("currencies").select("*").order("code"),
      ]);
      if (cur.error) throw cur.error;
      if (gen === generation.current) {
        setFamily(nextFamily);
        setMembers((memberResult.data ?? []) as FamilyMember[]);
        setFamilyEnabled(enabled);
        setActiveFamilyId(scope);
        setDataReady(true);
        setRows(m as Movement[]);
        setCategories(
          (c as Category[]).sort((a, b) => a.name.localeCompare(b.name, "es")),
        );
        setBudgets(b as Budget[]);
        setCurrencies(cur.data);
      }
    } catch (e) {
      if (gen === generation.current) {
        const failure = e as { code?: string; message?: string };
        setError(
          ["42703", "PGRST204"].includes(failure.code ?? "") &&
            /reference/i.test(failure.message ?? "")
            ? "Falta el campo Referencia. Ejecutá 202609280003_reference_repair.sql en Supabase y tocá Reintentar carga. No repitas la migración de familias."
            : errorText(e),
        );
        setRows([]);
        setCategories([]);
        setBudgets([]);
        setDataReady(false);
      }
    } finally {
      if (gen === generation.current) setLoading(false);
    }
  }, [preferPersonal]);
  useEffect(() => {
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    if (!supabase) return;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      const nextId = next?.user.id ?? null;
      if (nextId !== authenticatedUser.current) {
        authenticatedUser.current = nextId;
        generation.current++;
        setRows([]);
        setCategories([]);
        setBudgets([]);
        setModal(null);
        setNotice("");
        setError("");
        setFamily(null);
        setMembers([]);
        setActiveFamilyId(null);
        setDataReady(false);
        setPreferPersonal(false);
        setMemberFilter("all");
        openedExpense.current = null;
      }
      setUser(next?.user ?? null);
      setAuthReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (user) void refresh();
  }, [user, refresh]);
  useEffect(() => {
    if (!user || !dataReady || openedExpense.current === user.id) return;
    openedExpense.current = user.id;
    const invitation = pendingInvitation();
    if (invitation) {
      window.location.assign(
        invitationLink(window.location.origin, invitation),
      );
      return;
    }
    let mobileFirst = true;
    try {
      mobileFirst =
        localStorage.getItem(`clara:expense-first:${user.id}`) !== "false";
    } catch {}
    if (
      initialExpense ||
      (!summaryOnly &&
        window.matchMedia("(max-width: 600px)").matches &&
        mobileFirst)
    )
      setModal({ type: "movement", expenseOnly: true });
  }, [user, dataReady, initialExpense, summaryOnly]);
  useEffect(() => {
    if (!user) return;
    const onFocus = () => {
      if (!modal && !busy) void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [user, modal, busy, refresh]);
  function changeSpace(personal: boolean) {
    setMemberFilter("all");
    generation.current++;
    setRows([]);
    setCategories([]);
    setBudgets([]);
    setLoading(true);
    setDataReady(false);
    setModal(null);
    setPreferPersonal(personal);
  }
  async function operation(fn: () => Promise<void | string>) {
    if (busy || loading || !dataReady) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const warning = await fn();
      if (authenticatedUser.current !== user?.id) return;
      setModal(null);
      await refresh();
      setNotice(warning || "Cambios guardados.");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function removeMovement(item: Movement) {
    if (
      !window.confirm(
        `¿Eliminar “${item.name}”? Esta acción no se puede deshacer.`,
      )
    )
      return;
    await operation(async () => {
      const { error } = await supabase!
        .from("movements")
        .delete()
        .eq("id", item.id);
      if (error) throw error;
      if (item.receipt_path) {
        const result = await supabase!.storage
          .from("receipts")
          .remove([item.receipt_path]);
        if (result.error)
          return "Movimiento eliminado. No se pudo quitar el archivo del ticket del almacenamiento; permanece privado.";
      }
    });
  }
  async function saveMovement(
    event: React.FormEvent<HTMLFormElement>,
    old?: Movement,
  ) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    await operation(async () => {
      const kind = String(f.get("kind")) as Movement["kind"];
      const code = String(f.get("currency"));
      const cur = currencies.find((c) => c.code === code)!;
      const amount = parseAmount(String(f.get("amount")), cur.decimals);
      const name = String(f.get("name")).trim();
      if (!name) throw new Error("Ingresá un concepto.");
      const path = kind === "expense" ? (old?.receipt_path ?? null) : null;
      const payload = {
        ...(!old && familyEnabled ? { family_id: activeFamilyId } : {}),
        date: String(f.get("date")),
        name,
        kind,
        amount,
        currency: code,
        category_id: f.get("category_id") || null,
        note: String(f.get("note")).trim(),
        receipt_path: path,
        ...(familyEnabled
          ? { reference: String(f.get("reference") || "").trim() }
          : {}),
      };
      const result = old
        ? await supabase!.from("movements").update(payload).eq("id", old.id)
        : await supabase!.from("movements").insert(payload);
      if (result.error) throw result.error;
      if (old?.receipt_path && old.receipt_path !== path) {
        const cleanup = await supabase!.storage
          .from("receipts")
          .remove([old.receipt_path]);
        if (cleanup.error)
          return "Movimiento guardado, pero no se pudo borrar el ticket anterior del almacenamiento. Permanece privado.";
      }
    });
  }
  async function saveCategory(
    event: React.FormEvent<HTMLFormElement>,
    old?: Category,
  ) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    await operation(async () => {
      const payload = {
        ...(!old && familyEnabled ? { family_id: activeFamilyId } : {}),
        name: String(f.get("name")).trim(),
        color: String(f.get("color")),
        kind: String(f.get("kind")),
        active: f.get("active") === "on",
      };
      if (!payload.name) throw new Error("Ingresá un nombre.");
      const { error } = old
        ? await supabase!.from("categories").update(payload).eq("id", old.id)
        : await supabase!.from("categories").insert(payload);
      if (error) throw error;
    });
  }
  async function saveBudget(
    event: React.FormEvent<HTMLFormElement>,
    old?: Budget,
  ) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    await operation(async () => {
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
      const { error } = existing
        ? await supabase!.from("budgets").update(payload).eq("id", existing.id)
        : await supabase!.from("budgets").insert({
            ...payload,
            ...(familyEnabled ? { family_id: activeFamilyId } : {}),
          });
      if (error) throw error;
    });
  }
  if (!authReady)
    return <div className="center-screen">Preparando tu espacio…</div>;
  if (!user) return <Auth configured={!!supabase} />;
  function authorName(id: string) {
    const member = members.find((m) => m.user_id === id);
    if (member)
      return `${member.display_name}${id === user?.id ? " (vos)" : ""}`;
    if (id === user?.id) return "Vos";
    return id ? `Exintegrante (${id.slice(0, 8)})` : "Autor no disponible";
  }
  const authorIds = [
    ...new Set([
      ...members.map((m) => m.user_id),
      ...rows.map((r) => r.user_id).filter(Boolean),
    ]),
  ];
  const expenseCategories = categories.filter((c) => c.kind === "expense");
  const monthBudgets = budgets.filter(
    (b) => b.month.startsWith(month) && b.currency === currency,
  );
  const distribution = expenseCategories
    .map((c) => ({
      ...c,
      total: sum(
        selected.filter((r) => r.category_id === c.id),
        "expense",
      ),
    }))
    .filter((c) => c.total.gt(0))
    .sort((a, b) => b.total.comparedTo(a.total));
  const filtered = selected
    .filter(
      (r) =>
        (tab !== "Movimientos" ||
          !activeFamilyId ||
          memberFilter === "all" ||
          r.user_id === memberFilter) &&
        (kindFilter === "all" || r.kind === kindFilter) &&
        `${r.name} ${r.note} ${r.reference || ""} ${categories.find((c) => c.id === r.category_id)?.name || ""}`
          .toLocaleLowerCase("es")
          .includes(search.toLocaleLowerCase("es")),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  const movementList = (list: Movement[]) =>
    list.length ? (
      <div className="movement-list">
        {list.map((r) => (
          <button
            className="movement"
            key={r.id}
            onClick={() => setModal({ type: "movement", item: r, read: true })}
          >
            <span
              className={`movement-icon ${r.kind === "income" ? "incoming" : ""}`}
            >
              {r.kind === "income" ? (
                <ArrowDownLeft size={20} />
              ) : (
                <ArrowUpRight size={20} />
              )}
            </span>
            <span className="grow">
              <strong>{r.name}</strong>
              <small>
                {categories.find((c) => c.id === r.category_id)?.name ||
                  "Ingreso"}{" "}
                · {r.date.split("-").reverse().join("/")}
                {r.receipt_path ? " · Ticket" : ""}
              </small>
              <small className="movement-author">
                Cargado por {authorName(r.user_id)}
              </small>
            </span>
            <strong className={r.kind === "income" ? "positive" : ""}>
              {r.kind === "income" ? "+" : "−"}
              {money(r.amount, current)}
            </strong>
            <ChevronRight size={16} />
          </button>
        ))}
      </div>
    ) : (
      <Empty
        title={
          tab === "Movimientos" &&
          (memberFilter !== "all" || search || kindFilter !== "all")
            ? "No hay movimientos para estos filtros"
            : "Todavía no hay movimientos"
        }
        text={
          tab === "Movimientos" &&
          (memberFilter !== "all" || search || kindFilter !== "all")
            ? "Probá con otro integrante, tipo o búsqueda."
            : "Registrá tu primer ingreso o gasto para empezar a ver tus números."
        }
        action={
          tab === "Movimientos" &&
          (memberFilter !== "all" || search || kindFilter !== "all")
            ? () => {
                setMemberFilter("all");
                setKindFilter("all");
                setSearch("");
              }
            : () => setModal({ type: "movement" })
        }
        actionLabel={
          tab === "Movimientos" &&
          (memberFilter !== "all" || search || kindFilter !== "all")
            ? "Limpiar filtros"
            : "Agregar movimiento"
        }
      />
    );
  return (
    <div className="app-shell">
      {mobileMenu && (
        <button
          className="menu-backdrop mobile-only"
          aria-label="Cerrar navegación"
          onClick={() => setMobileMenu(false)}
        />
      )}
      <aside
        id="navigation"
        className={mobileMenu ? "sidebar open" : "sidebar"}
      >
        <button
          className="icon-button mobile-only close-menu"
          aria-label="Cerrar menú"
          onClick={() => setMobileMenu(false)}
        >
          <X size={20} />
        </button>
        <a href="/" className="brand">
          <span className="brand-icon">
            <Leaf size={23} />
          </span>
          clara<span className="brand-dot">.</span>
        </a>
        <p className="sidebar-label">
          {activeFamilyId ? "TU ESPACIO FAMILIAR" : "TU ESPACIO PERSONAL"}
        </p>
        <nav>
          {tabs.map(({ name, icon: Icon }) => (
            <button
              key={name}
              className={tab === name ? "nav-item active" : "nav-item"}
              onClick={() => {
                setTab(name);
                setMobileMenu(false);
                setError("");
              }}
            >
              <Icon size={20} />
              {name}
              {tab === name && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy">
            <ShieldCheck size={20} />
            <div>
              <strong>{activeFamilyId ? "En familia" : "Solo para vos"}</strong>
              <small>
                {activeFamilyId
                  ? "Solo los integrantes"
                  : "Tus datos son privados"}
              </small>
            </div>
          </div>
          <button
            className="account"
            onClick={async () => {
              const { error } = await supabase!.auth.signOut();
              if (error) setError(error.message);
            }}
          >
            <span className="avatar">{user.email?.[0].toUpperCase()}</span>
            <span className="grow">
              <strong>Mi cuenta</strong>
              <small>{user.email}</small>
            </span>
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <button
            className="icon-button mobile-only"
            aria-label="Abrir menú"
            aria-expanded={mobileMenu}
            aria-controls="navigation"
            onClick={() => setMobileMenu(!mobileMenu)}
          >
            <Menu />
          </button>
          <span>
            {activeFamilyId ? family?.name : "Mi espacio"}{" "}
            <span className="breadcrumb">/ {tab}</span>
          </span>
          <span className="topbar-right">
            <span className="status-dot" /> Finanzas personales
          </span>
        </header>
        <div className="content">
          {family && (
            <div className="space-picker">
              <label>
                Espacio
                <select
                  aria-label="Espacio de finanzas"
                  value={preferPersonal ? "personal" : "family"}
                  disabled={busy}
                  onChange={(e) => changeSpace(e.target.value === "personal")}
                >
                  <option value="family">{family.name} · Compartido</option>
                  <option value="personal">Mi espacio personal</option>
                </select>
              </label>
              <button
                className="text-button"
                disabled={busy || loading}
                onClick={() => void refresh()}
              >
                Actualizar datos
              </button>
            </div>
          )}
          <div className="page-heading">
            <div>
              <div className="eyebrow">UN POCO DE CLARIDAD, TODOS LOS DÍAS</div>
              <h1>{tab === "Resumen" ? "Tus finanzas, en orden." : tab}</h1>
              <p>
                {tab === "Resumen"
                  ? "Entendé dónde estás y decidí hacia dónde querés ir."
                  : tab === "Movimientos"
                    ? "Cada movimiento cuenta. Encontralos todos acá."
                    : tab === "Presupuestos"
                      ? "Dale un lugar a cada peso. Y a cada dólar."
                      : tab === "Ver gastos"
                        ? "Una mirada amplia a tu año, mes a mes."
                        : "Organizá tus movimientos a tu manera."}
              </p>
            </div>
            <button
              className="primary"
              onClick={() =>
                setModal(
                  tab === "Categorías"
                    ? { type: "category" }
                    : tab === "Presupuestos"
                      ? { type: "budget" }
                      : { type: "movement" },
                )
              }
            >
              <Plus size={18} />
              {tab === "Categorías"
                ? "Nueva categoría"
                : tab === "Presupuestos"
                  ? "Nuevo presupuesto"
                  : "Nuevo movimiento"}
            </button>
          </div>
          {error && (
            <div role="alert" className="alert">
              {error}
              <button onClick={() => void refresh()}>Reintentar carga</button>
            </div>
          )}
          {notice && (
            <div role="status" className="notice">
              <Check size={16} />
              {notice}
              <button aria-label="Cerrar aviso" onClick={() => setNotice("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {tab !== "Categorías" && tab !== "Grupo Familiar" && (
            <div className="filters">
              <div className="period">
                <label htmlFor="period">
                  {tab === "Ver gastos" ? "Año" : "Período"}
                </label>
                {tab === "Ver gastos" ? (
                  <input
                    id="period"
                    aria-label="Año"
                    type="number"
                    min="1900"
                    max="9999"
                    value={year}
                    onChange={(e) => {
                      if (/^\d{4}$/.test(e.target.value))
                        setMonth(`${e.target.value}-01`);
                    }}
                  />
                ) : (
                  <input
                    id="period"
                    type="month"
                    required
                    value={month}
                    onChange={(e) => {
                      if (e.target.value) setMonth(e.target.value);
                    }}
                  />
                )}
              </div>
              <div className="currency-switch" aria-label="Moneda">
                {currencies.map((c) => (
                  <button
                    aria-pressed={currency === c.code}
                    className={currency === c.code ? "selected" : ""}
                    key={c.code}
                    onClick={() => setCurrency(c.code)}
                  >
                    {c.code}
                  </button>
                ))}
              </div>
              <span className="filter-hint">
                Cada moneda, sus propios números
              </span>
            </div>
          )}
          {(tab === "Resumen" || tab === "Ver gastos") && (
            <div
              className="report-tabs"
              role="group"
              aria-label="Vista del informe"
            >
              <button
                type="button"
                aria-pressed={tab === "Resumen"}
                onClick={() => setTab("Resumen")}
              >
                Vista mensual
              </button>
              <button
                type="button"
                aria-pressed={tab === "Ver gastos"}
                onClick={() => setTab("Ver gastos")}
              >
                Ver gastos
              </button>
            </div>
          )}
          {loading ? (
            <div className="card loading" role="status">
              Cargando tus datos…
            </div>
          ) : (
            <>
              {tab === "Grupo Familiar" && (
                <FamilyPanel
                  family={family}
                  members={members}
                  enabled={familyEnabled}
                  userId={user.id}
                  onChange={async () => {
                    if (preferPersonal) changeSpace(false);
                    else await refresh();
                  }}
                />
              )}
              {tab === "Resumen" && (
                <>
                  <div className="summary-grid">
                    <Summary
                      label="Saldo del mes"
                      value={money(summary.balance, current)}
                      dark
                      icon={<Wallet size={19} />}
                      foot="Ingresos menos gastos"
                    />
                    <Summary
                      label="Ingresos"
                      value={money(summary.income, current)}
                      icon={<ArrowDownLeft size={19} />}
                      foot={`${selected.filter((r) => r.kind === "income").length} ingresos este mes`}
                    />
                    <Summary
                      label="Gastos"
                      value={money(summary.expense, current)}
                      icon={<ArrowUpRight size={19} />}
                      foot={`${selected.filter((r) => r.kind === "expense").length} gastos este mes`}
                    />
                  </div>
                  <div className="chart-grid">
                    <section className="card">
                      <div className="section-heading">
                        <div>
                          <h2>El ritmo de tu mes</h2>
                          <p>
                            Ingresos y gastos por día · {month} · {currency}
                          </p>
                        </div>
                        <span className="badge">Diario</span>
                      </div>
                      <Evolution
                        rows={rows}
                        currency={current}
                        year={year}
                        month={month}
                      />
                    </section>
                    <section className="card">
                      <div className="section-heading">
                        <div>
                          <h2>¿En qué se fue?</h2>
                          <p>Gastos por categoría</p>
                        </div>
                        <span className="badge">{currency}</span>
                      </div>
                      {distribution.length ? (
                        <Distribution
                          items={distribution}
                          currency={current}
                          total={summary.expense}
                        />
                      ) : (
                        <Empty
                          title="Tu mapa de gastos, acá"
                          text="Cuando registres gastos, vas a ver cómo se distribuyen."
                        />
                      )}
                    </section>
                  </div>
                  <div className="chart-grid">
                    <section className="card">
                      <div className="section-heading">
                        <div>
                          <h2>Últimos movimientos</h2>
                          <p>Los detalles hacen la diferencia</p>
                        </div>
                        <button
                          className="text-button"
                          onClick={() => setTab("Movimientos")}
                        >
                          Ver todos <ChevronRight size={15} />
                        </button>
                      </div>
                      {movementList(filtered.slice(0, 5))}
                    </section>
                    <section className="card">
                      <div className="section-heading">
                        <div>
                          <h2>Tus presupuestos</h2>
                          <p>Un plan para este mes</p>
                        </div>
                        <button
                          className="text-button"
                          onClick={() => setTab("Presupuestos")}
                        >
                          Ver todos <ChevronRight size={15} />
                        </button>
                      </div>
                      {monthBudgets.length ? (
                        monthBudgets.slice(0, 4).map((b) => (
                          <BudgetProgress
                            key={b.id}
                            budget={b}
                            category={categories.find(
                              (c) => c.id === b.category_id,
                            )}
                            spent={sum(
                              selected.filter(
                                (r) => r.category_id === b.category_id,
                              ),
                              "expense",
                            )}
                            currency={current}
                          />
                        ))
                      ) : (
                        <Empty
                          title="Poné tus objetivos en marcha"
                          text="Creá un presupuesto y seguí tus gastos sin perder de vista tu plan."
                          action={() => setModal({ type: "budget" })}
                          actionLabel="Crear presupuesto"
                        />
                      )}
                    </section>
                  </div>
                </>
              )}
              {tab === "Movimientos" && (
                <section className="card">
                  <div className="list-filters">
                    {activeFamilyId && (
                      <select
                        aria-label="Filtrar por integrante"
                        value={memberFilter}
                        onChange={(e) => setMemberFilter(e.target.value)}
                      >
                        <option value="all">Todos los integrantes</option>
                        {authorIds.map((id) => (
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
                      value={kindFilter}
                      onChange={(e) => setKindFilter(e.target.value)}
                    >
                      <option value="all">Todos los tipos</option>
                      <option value="expense">Gastos</option>
                      <option value="income">Ingresos</option>
                    </select>
                  </div>
                  {movementList(filtered)}
                </section>
              )}
              {tab === "Presupuestos" && (
                <div className="budget-grid">
                  {monthBudgets.length ? (
                    monthBudgets.map((b) => (
                      <section key={b.id} className="card">
                        <BudgetProgress
                          budget={b}
                          category={categories.find(
                            (c) => c.id === b.category_id,
                          )}
                          spent={sum(
                            selected.filter(
                              (r) => r.category_id === b.category_id,
                            ),
                            "expense",
                          )}
                          currency={current}
                        />
                        <div className="row-actions">
                          <button
                            className="text-button"
                            onClick={() =>
                              setModal({ type: "budget", item: b })
                            }
                          >
                            <Pencil size={16} />
                            Editar
                          </button>
                          <button
                            className="danger-link"
                            onClick={() => {
                              if (confirm("¿Eliminar este presupuesto?"))
                                void operation(async () => {
                                  const { error } = await supabase!
                                    .from("budgets")
                                    .delete()
                                    .eq("id", b.id);
                                  if (error) throw error;
                                });
                            }}
                          >
                            <Trash2 size={16} />
                            Eliminar
                          </button>
                        </div>
                      </section>
                    ))
                  ) : (
                    <section className="card">
                      <Empty
                        title="Un mes con un plan"
                        text="Definí cuánto querés gastar en cada categoría y moneda."
                        action={() => setModal({ type: "budget" })}
                        actionLabel="Crear presupuesto"
                      />
                    </section>
                  )}
                </div>
              )}
              {tab === "Ver gastos" && (
                <>
                  <AnnualOverview
                    rows={rows}
                    categories={expenseCategories}
                    currency={current}
                    year={year}
                  />
                  <section className="card">
                    <div className="section-heading">
                      <div>
                        <h2>Tu año en perspectiva</h2>
                        <p>
                          {year} · {currency}. Deslizá la tabla para ver todas
                          las categorías.
                        </p>
                      </div>
                    </div>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Mes</th>
                            {expenseCategories.map((c) => (
                              <th key={c.id}>
                                {c.name}
                                {!c.active ? " (inactiva)" : ""}
                              </th>
                            ))}
                            <th>Gastos</th>
                            <th>Ingresos</th>
                            <th>Saldo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {months.map((name, i) => {
                            const period = `${year}-${String(i + 1).padStart(2, "0")}`;
                            const t = totals(rows, currency, period);
                            return (
                              <tr key={name}>
                                <th>{name}</th>
                                {expenseCategories.map((c) => (
                                  <td key={c.id}>
                                    {money(
                                      sum(
                                        rows.filter(
                                          (r) =>
                                            r.currency === currency &&
                                            r.date.startsWith(period) &&
                                            r.category_id === c.id,
                                        ),
                                        "expense",
                                      ),
                                      current,
                                    )}
                                  </td>
                                ))}
                                <td>{money(t.expense, current)}</td>
                                <td className="positive">
                                  {money(t.income, current)}
                                </td>
                                <td>{money(t.balance, current)}</td>
                              </tr>
                            );
                          })}
                          <tr className="total-row">
                            <th>Total anual</th>
                            {expenseCategories.map((c) => (
                              <td key={c.id}>
                                {money(
                                  sum(
                                    rows.filter(
                                      (r) =>
                                        r.currency === currency &&
                                        r.date.startsWith(year + "-") &&
                                        r.category_id === c.id,
                                    ),
                                    "expense",
                                  ),
                                  current,
                                )}
                              </td>
                            ))}
                            {(["expense", "income", "balance"] as const).map(
                              (k) => (
                                <td key={k}>
                                  {money(
                                    totals(rows, currency, year + "-")[k],
                                    current,
                                  )}
                                </td>
                              ),
                            )}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </section>
                </>
              )}
              {tab === "Categorías" && (
                <section className="card">
                  <div className="section-heading">
                    <div>
                      <h2>Un lugar para cada movimiento</h2>
                      <p>
                        Desactivá las categorías que ya no usás. Su historial se
                        conserva.
                      </p>
                    </div>
                    <span className="badge">
                      {categories.length} categorías
                    </span>
                  </div>
                  <div className="category-grid">
                    {categories.map((c) => (
                      <button
                        key={c.id}
                        className={`category-tile ${!c.active ? "inactive" : ""}`}
                        onClick={() => setModal({ type: "category", item: c })}
                      >
                        <span
                          className="category-swatch"
                          style={{ background: c.color }}
                        >
                          <Tags size={18} />
                        </span>
                        <span className="grow">
                          <strong>{c.name}</strong>
                          <small>
                            {c.kind === "expense" ? "Gasto" : "Ingreso"} ·{" "}
                            {c.active ? "Activa" : "Desactivada"}
                          </small>
                        </span>
                        <Pencil size={16} />
                      </button>
                    ))}
                  </div>
                  {!categories.length && (
                    <Empty
                      title="Creá tu primera categoría"
                      text="Las categorías te ayudan a organizar tus finanzas."
                      action={() => setModal({ type: "category" })}
                      actionLabel="Nueva categoría"
                    />
                  )}
                </section>
              )}
            </>
          )}
          <footer>
            <Leaf size={14} /> Más claridad. Más tranquilidad.
            <span>Hecho para tus finanzas de todos los días.</span>
          </footer>
        </div>
      </main>
      {!modal && !mobileMenu && (
        <button
          type="button"
          className="quick-movement"
          aria-label="Agregar movimiento"
          aria-haspopup="dialog"
          onClick={() => {
            setError("");
            setModal({ type: "movement" });
          }}
        >
          <Plus size={23} aria-hidden="true" />
          <span>Agregar movimiento</span>
        </button>
      )}
      {modal && (
        <ModalShell
          title={
            modal.type === "movement"
              ? modal.read
                ? "Detalle del movimiento"
                : modal.item
                  ? "Editar movimiento"
                  : modal.expenseOnly
                    ? "Agregar gasto"
                    : "Nuevo movimiento"
              : modal.type === "category"
                ? modal.item
                  ? "Editar categoría"
                  : "Nueva categoría"
                : modal.item
                  ? "Editar presupuesto"
                  : "Nuevo presupuesto"
          }
          busy={busy}
          close={() => {
            setModal(null);
            setError("");
          }}
        >
          {error && (
            <div className="alert" role="alert">
              {error}
            </div>
          )}
          {modal.type === "movement" ? (
            modal.read && modal.item ? (
              <MovementDetail
                item={modal.item}
                author={authorName(modal.item.user_id)}
                currency={currencies.find(
                  (c) => c.code === modal.item!.currency,
                )!}
                category={categories.find(
                  (c) => c.id === modal.item!.category_id,
                )}
                edit={() => setModal({ ...modal, read: false })}
                remove={() => void removeMovement(modal.item!)}
                busy={busy}
              />
            ) : (
              <MovementForm
                item={modal.item}
                currencies={currencies}
                categories={categories}
                currency={currency}
                busy={busy || loading || !dataReady}
                expenseOnly={modal.expenseOnly}
                referenceEnabled={familyEnabled}
                submit={(e) => void saveMovement(e, modal.item)}
              />
            )
          ) : modal.type === "category" ? (
            <form onSubmit={(e) => void saveCategory(e, modal.item)}>
              <label>
                Nombre
                <input
                  name="name"
                  required
                  maxLength={60}
                  defaultValue={modal.item?.name}
                />
              </label>
              <div className="form-grid">
                <label>
                  Color
                  <input
                    name="color"
                    type="color"
                    defaultValue={modal.item?.color || "#176b51"}
                  />
                </label>
                <label>
                  Tipo
                  <select
                    name="kind"
                    defaultValue={modal.item?.kind || "expense"}
                  >
                    <option value="expense">Gasto</option>
                    <option value="income">Ingreso</option>
                  </select>
                </label>
              </div>
              <label className="checkbox">
                <input
                  name="active"
                  type="checkbox"
                  defaultChecked={modal.item?.active ?? true}
                />
                Categoría activa
              </label>
              <p className="help">
                Si tiene movimientos o presupuestos, podés desactivarla; no se
                puede eliminar ni cambiar su tipo.
              </p>
              <button disabled={busy} className="primary full">
                {busy ? "Guardando…" : "Guardar categoría"}
              </button>
              {modal.item && (
                <button
                  type="button"
                  disabled={busy}
                  className="danger-link full"
                  onClick={() => {
                    const item = modal.item!;
                    if (confirm(`¿Eliminar la categoría “${item.name}”?`))
                      void operation(async () => {
                        const { error } = await supabase!
                          .from("categories")
                          .delete()
                          .eq("id", item.id);
                        if (error) throw error;
                      });
                  }}
                >
                  Eliminar categoría
                </button>
              )}
            </form>
          ) : (
            <form onSubmit={(e) => void saveBudget(e, modal.item)}>
              <label>
                Mes
                <input
                  type="month"
                  name="month"
                  required
                  defaultValue={modal.item?.month.slice(0, 7) || month}
                />
              </label>
              <label>
                Categoría
                <select
                  name="category_id"
                  required
                  defaultValue={modal.item?.category_id || ""}
                >
                  <option value="" disabled>
                    Elegí una categoría
                  </option>
                  {expenseCategories
                    .filter((c) => c.active || c.id === modal.item?.category_id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </label>
              <div className="form-grid">
                <label>
                  Moneda
                  <select
                    name="currency"
                    defaultValue={modal.item?.currency || currency}
                  >
                    {currencies.map((c) => (
                      <option key={c.code}>{c.code}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Presupuesto
                  <input
                    name="amount"
                    inputMode="decimal"
                    required
                    defaultValue={modal.item?.amount}
                    placeholder="0,00"
                  />
                </label>
              </div>
              <p className="help">
                Un presupuesto por categoría, mes y moneda. Si ya existe, se
                actualiza.
              </p>
              <button disabled={busy} className="primary full">
                {busy ? "Guardando…" : "Guardar presupuesto"}
              </button>
            </form>
          )}
        </ModalShell>
      )}
    </div>
  );
}
