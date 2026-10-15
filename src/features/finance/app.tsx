"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  Plus,
  LogOut,
  X,
  Menu,
  Check,
  CloudOff,
  Leaf,
  ShieldCheck,
} from "lucide-react";
import { FamilyPanel } from "@/features/family/family-panel";
import { AccountPanel } from "@/features/family/account-panel";
import {
  pendingInvitation,
  invitationLink,
} from "@/features/family/invitation";
import { ModalShell } from "@/components/ui";
import { Auth } from "@/features/auth/auth-form";
import { AnnualOverview } from "@/features/reports/annual-overview";
import { AnnualTable } from "@/features/reports/annual-table";
import { SummaryTab } from "@/features/reports/summary-tab";
import { BudgetsTab } from "@/features/budgets/budgets-tab";
import { BudgetForm } from "@/features/budgets/budget-form";
import {
  CategoriesTab,
  CategoryForm,
} from "@/features/categories/categories-tab";
import { MovementForm } from "@/features/movements/movement-form";
import { MovementDetail } from "@/features/movements/movement-detail";
import { MovementsTab } from "@/features/movements/movements-tab";
import {
  MethodForm,
  PaymentsTab,
  TransferForm,
} from "@/features/payments/payments-tab";
import {
  ReminderCard,
  removePushSubscription,
} from "@/features/reminders/reminder-card";
import { interpretPhrase } from "@/features/voice/interpret";
import { OfflineCapture } from "@/features/offline/offline-capture";
import {
  type LastUser,
  readLastUser,
  writeLastUser,
  writeQueue,
  writeSnapshot,
} from "@/features/offline/store";
import { supabase } from "@/lib/supabase";
import {
  type Category,
  type Movement,
  type Budget,
  type PaymentMethod,
  initialCurrencies,
  shiftMonth,
  sum,
  today,
} from "./model";
import { type Tab, tabs, tabFromLocation, tabUrl } from "./navigation";
import { useFinanceData } from "./use-finance-data";
type Modal =
  | { type: "movement"; item?: Movement; read?: boolean; expenseOnly?: boolean }
  | { type: "category"; item?: Category }
  | { type: "budget"; item?: Budget }
  | { type: "method"; item?: PaymentMethod }
  | { type: "transfer"; item?: undefined }
  | null;
export default function FinanceApp({
  initialExpense = false,
  summaryOnly = false,
}: {
  initialExpense?: boolean;
  summaryOnly?: boolean;
}) {
  const [user, setUser] = useState<User | null>(null),
    [authReady, setAuthReady] = useState(!supabase),
    [tab, setTabState] = useState<Tab>("Resumen"),
    [month, setMonth] = useState(today().slice(0, 7)),
    [currency, setCurrency] = useState("ARS"),
    [modal, setModal] = useState<Modal>(null),
    [mobileMenu, setMobileMenu] = useState(false),
    [online, setOnline] = useState(true),
    [lastUser, setLastUser] = useState<LastUser | null>(null);
  const year = month.slice(0, 4);
  const data = useFinanceData(user?.id ?? null, year);
  const { reset, refresh, dataReady } = data;
  const authenticatedUser = useRef<string | null>(null);
  const openedExpense = useRef<string | null>(null);
  useEffect(() => {
    if ("serviceWorker" in navigator)
      navigator.serviceWorker
        .register("/sw.js")
        .then(() => navigator.serviceWorker.ready)
        .then((registration) =>
          // Para que la app abra sin conexión, el worker guarda lo que esta página ya descargó.
          registration.active?.postMessage({
            type: "cache-static",
            urls: performance
              .getEntriesByType("resource")
              .map((entry) => entry.name),
          }),
        )
        .catch(() => {});
    setLastUser(readLastUser());
    setOnline(navigator.onLine);
    const goOnline = () => setOnline(true),
      goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    const subscription = supabase?.auth.onAuthStateChange((_event, next) => {
      const nextId = next?.user.id ?? null;
      if (nextId !== authenticatedUser.current) {
        authenticatedUser.current = nextId;
        reset(nextId);
        setModal(null);
        openedExpense.current = null;
      }
      if (next?.user) {
        const remembered = { id: next.user.id, email: next.user.email ?? "" };
        writeLastUser(remembered);
        setLastUser(remembered);
      }
      setUser(next?.user ?? null);
      setAuthReady(true);
    }).data.subscription;
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      subscription?.unsubscribe();
    };
  }, [reset]);
  // La pestaña vive en ?tab= y el diálogo abierto ocupa una entrada del historial:
  // así el botón atrás cierra el diálogo o vuelve a la pestaña anterior.
  useEffect(() => {
    const sync = () => {
      setTabState(tabFromLocation());
      if (!window.history.state?.claraModal) setModal(null);
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  function setTab(next: Tab) {
    setMobileMenu(false);
    data.setError("");
    if (next === tab) return;
    window.history.pushState(null, "", tabUrl(next));
    setTabState(next);
  }
  const showModal = useCallback((next: NonNullable<Modal>) => {
    if (!window.history.state?.claraModal)
      window.history.pushState({ claraModal: true }, "");
    setModal(next);
  }, []);
  function closeModal() {
    data.setError("");
    if (window.history.state?.claraModal) window.history.back();
    else setModal(null);
  }
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
      showModal({ type: "movement", expenseOnly: true });
  }, [user, dataReady, initialExpense, summaryOnly, showModal]);
  const retryConnection = useCallback(() => {
    if (authenticatedUser.current) void refresh();
    else window.location.reload();
  }, [refresh]);

  // Sin red se puede seguir anotando, con o sin sesión vigente en este dispositivo.
  const offlineUserId = user
    ? data.offline || (!online && !dataReady)
      ? user.id
      : null
    : !online
      ? (lastUser?.id ?? null)
      : null;
  if (offlineUserId)
    return (
      <OfflineCapture
        key={offlineUserId}
        userId={offlineUserId}
        retry={retryConnection}
      />
    );
  if (!authReady)
    return <div className="center-screen">Preparando tu espacio…</div>;
  if (!user) return <Auth configured={!!supabase} />;

  const {
    rows,
    categories,
    budgets,
    currencies,
    methods,
    family,
    members,
    activeFamilyId,
    busy,
    loading,
    queue,
  } = data;
  const current =
    currencies.find((c) => c.code === currency) || initialCurrencies[0];
  const meta = tabs.find((t) => t.name === tab)!;
  const selected = rows.filter(
    (r) => r.date.startsWith(month) && r.currency === currency,
  );
  const expenseCategories = categories.filter((c) => c.kind === "expense");
  const monthBudgets = budgets.filter(
    (b) => b.month.startsWith(month) && b.currency === currency,
  );
  const previousMonth = shiftMonth(month, -1);
  const spent = (categoryId: string) =>
    sum(
      selected.filter((r) => r.category_id === categoryId),
      "expense",
    );
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
  const create =
    tab === "Categorías"
      ? { label: "Nueva categoría", modal: { type: "category" } as const }
      : tab === "Presupuestos"
        ? { label: "Nuevo presupuesto", modal: { type: "budget" } as const }
        : tab === "Medios de pago"
          ? data.paymentsEnabled
            ? {
                label: "Nuevo medio de pago",
                modal: { type: "method" } as const,
              }
            : null
          : tab === "Grupo Familiar"
            ? null
            : {
                label: "Nuevo movimiento",
                modal: { type: "movement" } as const,
              };
  const failed = queue.filter((q) => q.error);
  async function forgetDevice(userId: string) {
    writeLastUser(null);
    setLastUser(null);
    writeSnapshot(userId, null);
    await removePushSubscription();
    const { error } = await supabase!.auth.signOut({ scope: "local" });
    if (error) data.setError(error.message);
  }
  async function signOut() {
    if (
      queue.length &&
      !window.confirm(
        "Tenés movimientos sin sincronizar. Quedan guardados en este dispositivo y se envían cuando vuelvas a entrar con esta cuenta. ¿Cerrar sesión igual?",
      )
    )
      return;
    await data.flushPending();
    await forgetDevice(user!.id);
  }
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
              aria-current={tab === name ? "page" : undefined}
              onClick={() => setTab(name)}
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
            aria-label={`Cerrar sesión de ${user.email}`}
            onClick={() => void signOut()}
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
                  value={data.preferPersonal ? "personal" : "family"}
                  disabled={busy}
                  onChange={(e) =>
                    data.changeSpace(e.target.value === "personal")
                  }
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
              <p>{meta.text}</p>
            </div>
            {create && (
              <button
                className="primary"
                onClick={() => showModal(create.modal)}
              >
                <Plus size={18} />
                {create.label}
              </button>
            )}
          </div>
          {data.loadError && (
            <div role="alert" className="alert">
              {data.loadError}
              <button onClick={() => void refresh()}>Reintentar carga</button>
            </div>
          )}
          {data.error && !modal && (
            <div role="alert" className="alert">
              {data.error}
              <button onClick={() => data.setError("")}>Cerrar</button>
            </div>
          )}
          {data.notice && (
            <div role="status" className="notice">
              <Check size={16} />
              {data.notice.text}
              {data.notice.undo && (
                <button className="notice-action" onClick={data.notice.undo}>
                  Deshacer
                </button>
              )}
              <button
                aria-label="Cerrar aviso"
                onClick={() => data.setNotice(null)}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {queue.length > 0 && (
            <div role="status" className="notice pending">
              <CloudOff size={16} />
              <span>
                {queue.length === 1
                  ? "1 movimiento guardado en este dispositivo, pendiente de sincronizar."
                  : `${queue.length} movimientos guardados en este dispositivo, pendientes de sincronizar.`}
                {failed.length > 0 &&
                  ` ${failed.length === 1 ? "Uno no se pudo enviar" : `${failed.length} no se pudieron enviar`}: ${failed[0].error}`}
              </span>
              <button
                className="notice-action"
                onClick={() => void data.flushQueue(true)}
              >
                Sincronizar ahora
              </button>
              <button
                className="notice-action"
                onClick={() => {
                  if (
                    window.confirm(
                      "¿Descartar los movimientos pendientes? No se van a guardar.",
                    )
                  )
                    data.discardQueue();
                }}
              >
                Descartar
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
                <div className="family-layout">
                  <FamilyPanel
                    family={family}
                    members={members}
                    enabled={data.familyEnabled}
                    userId={user.id}
                    onChange={async () => {
                      if (data.preferPersonal) data.changeSpace(false);
                      else await refresh();
                    }}
                  />
                  <ReminderCard />
                  <AccountPanel
                    userId={user.id}
                    email={user.email ?? ""}
                    ownsSharedFamily={
                      family?.owner_id === user.id && members.length > 1
                    }
                    deleted={async () => {
                      writeQueue(user.id, []);
                      try {
                        localStorage.removeItem(
                          `clara:expense-first:${user.id}`,
                        );
                      } catch {}
                      await forgetDevice(user.id);
                    }}
                  />
                </div>
              )}
              {tab === "Resumen" && (
                <SummaryTab
                  rows={rows}
                  categories={categories}
                  budgets={monthBudgets}
                  currency={current}
                  month={month}
                  methods={methods}
                  authorName={authorName}
                  open={(item) =>
                    showModal({ type: "movement", item, read: true })
                  }
                  create={() => showModal({ type: "movement" })}
                  createBudget={() => showModal({ type: "budget" })}
                  seeMovements={() => setTab("Movimientos")}
                  seeBudgets={() => setTab("Presupuestos")}
                />
              )}
              {tab === "Movimientos" && (
                <MovementsTab
                  key={activeFamilyId ?? "personal"}
                  rows={selected}
                  yearRows={rows.filter((r) => r.date.startsWith(year + "-"))}
                  year={year}
                  categories={categories}
                  currencies={currencies}
                  currency={current}
                  methods={methods}
                  authors={activeFamilyId ? authorIds : null}
                  authorName={authorName}
                  busy={busy}
                  open={(item) =>
                    showModal({ type: "movement", item, read: true })
                  }
                  create={() => showModal({ type: "movement" })}
                  importRows={data.importMovements}
                />
              )}
              {tab === "Presupuestos" && (
                <BudgetsTab
                  budgets={monthBudgets}
                  categories={categories}
                  currency={current}
                  spent={spent}
                  previousMonth={previousMonth}
                  copyable={
                    data.budgetsToCopy(previousMonth, month, currency).length
                  }
                  busy={busy}
                  copy={() =>
                    void data.copyBudgets(previousMonth, month, currency)
                  }
                  create={() => showModal({ type: "budget" })}
                  edit={(item) => showModal({ type: "budget", item })}
                  remove={data.removeBudget}
                />
              )}
              {tab === "Medios de pago" && (
                <PaymentsTab
                  enabled={data.paymentsEnabled}
                  accountsEnabled={data.accountsEnabled}
                  methods={methods}
                  rows={rows}
                  upcoming={data.upcoming}
                  transfers={data.transfers}
                  balances={data.balances}
                  currencies={currencies}
                  transfer={() => showModal({ type: "transfer" })}
                  removeTransfer={data.removeTransfer}
                  currency={current}
                  month={month}
                  busy={busy}
                  create={() => showModal({ type: "method" })}
                  quickCreate={(name, kind) => {
                    const form = new FormData();
                    form.set("name", name);
                    form.set("kind", kind);
                    void data.saveMethod(form);
                  }}
                  edit={(item) => showModal({ type: "method", item })}
                />
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
                    <AnnualTable
                      rows={rows}
                      categories={expenseCategories}
                      currency={current}
                      year={year}
                    />
                  </section>
                </>
              )}
              {tab === "Categorías" && (
                <CategoriesTab
                  categories={categories}
                  create={() => showModal({ type: "category" })}
                  edit={(item) => showModal({ type: "category", item })}
                />
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
            data.setError("");
            showModal({ type: "movement" });
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
                : modal.type === "transfer"
                  ? "Transferir o pagar tarjeta"
                  : modal.type === "method"
                  ? modal.item
                    ? "Editar medio de pago"
                    : "Nuevo medio de pago"
                  : modal.item
                    ? "Editar presupuesto"
                    : "Nuevo presupuesto"
          }
          busy={busy}
          close={closeModal}
        >
          {data.error && (
            <div className="alert" role="alert">
              {data.error}
            </div>
          )}
          {modal.type === "movement" ? (
            modal.read && modal.item ? (
              <MovementDetail
                item={modal.item}
                author={authorName(modal.item.user_id)}
                method={
                  methods.find((m) => m.id === modal.item!.payment_method_id)
                    ?.name
                }
                currency={
                  currencies.find((c) => c.code === modal.item!.currency) ??
                  current
                }
                category={categories.find(
                  (c) => c.id === modal.item!.category_id,
                )}
                edit={() => setModal({ ...modal, read: false })}
                remove={() => {
                  if (data.removeMovement(modal.item!)) closeModal();
                }}
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
                referenceEnabled={data.familyEnabled}
                methods={methods}
                interpret={
                  online
                    ? (text, defaultCurrency) =>
                        interpretPhrase({
                          text,
                          today: today(),
                          defaultCurrency,
                          currencies: currencies.map((c) => c.code),
                          categories: categories
                            .filter((c) => c.active)
                            .map(({ name, kind }) => ({ name, kind })),
                          methods: methods
                            .filter((m) => m.active)
                            .map((m) => m.name),
                        })
                    : undefined
                }
                submit={async (form) => {
                  if (await data.saveMovement(form, modal.item)) closeModal();
                }}
              />
            )
          ) : modal.type === "category" ? (
            <CategoryForm
              item={modal.item}
              busy={busy}
              submit={async (form) => {
                if (await data.saveCategory(form, modal.item)) closeModal();
              }}
              remove={(item) => {
                if (data.removeCategory(item)) closeModal();
              }}
            />
          ) : modal.type === "method" ? (
            <MethodForm
              item={modal.item}
              currencies={currencies}
              accountsEnabled={data.accountsEnabled}
              busy={busy}
              submit={async (form) => {
                if (await data.saveMethod(form, modal.item)) closeModal();
              }}
              remove={(item) => {
                if (data.removeMethod(item)) closeModal();
              }}
            />
          ) : modal.type === "transfer" ? (
            <TransferForm
              methods={methods}
              currencies={currencies}
              busy={busy}
              submit={async (form) => {
                if (await data.saveTransfer(form)) closeModal();
              }}
            />
          ) : (
            <BudgetForm
              item={modal.item}
              categories={expenseCategories}
              currencies={currencies}
              currency={currency}
              month={month}
              busy={busy}
              submit={async (form) => {
                if (await data.saveBudget(form, modal.item)) closeModal();
              }}
            />
          )}
        </ModalShell>
      )}
    </div>
  );
}
