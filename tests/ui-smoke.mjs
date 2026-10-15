// Backend simulado exclusivamente para verificar UI. No escribe en Supabase real.
// Iniciar dev con NEXT_PUBLIC_SUPABASE_URL=https://clara-test.supabase.co
// y NEXT_PUBLIC_SUPABASE_ANON_KEY=test-public-key-not-a-real-secret, puerto 3001.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  serviceWorkers: "block",
});
const errors = [];
let sessionUserId = "11111111-1111-1111-1111-111111111111";
let joins = 0;
const googleRequests = [];
const deletedReceipts = [];
const tables = {
  families: [],
  family_members: [],
  movements: [],
  payment_methods: [],
  transfers: [],
  budgets: [],
  categories: [
    {
      id: "c1",
      name: "Supermercado",
      kind: "expense",
      active: true,
      color: "#176b51",
    },
    {
      id: "c2",
      name: "Sueldo",
      kind: "income",
      active: true,
      color: "#6366f1",
    },
  ],
  currencies: [
    { code: "ARS", symbol: "$", decimals: 2 },
    { code: "USD", symbol: "US$", decimals: 2 },
  ],
};
await context.route("**/*", async (route) => {
  const req = route.request(),
    url = new URL(req.url());
  // La IA se simula: se comprueba qué manda la app y cómo vuelca la respuesta en el formulario.
  if (url.pathname === "/api/interpretar") {
    const body = req.postDataJSON();
    assert.equal(req.headers().authorization, "Bearer test-access-token");
    assert.equal(body.text, "mil ochocientos con cincuenta de yerba en el super con mercado pago en 3 cuotas");
    assert.ok(body.categories.some((c) => c.name === "Supermercado" && c.kind === "expense"));
    assert.deepEqual(body.methods, ["Mercado Pago"]);
    assert.equal(Object.keys(body).sort().join(), "categories,currencies,defaultCurrency,methods,text,today");
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        kind: "expense",
        amount: "1800.50",
        currency: null,
        category: "Supermercado",
        item: "Yerba",
        date: null,
        method: "Mercado Pago",
        installments: 3,
        more: false,
      }),
    });
  }
  if (!/^\/(auth|rest|storage)\/v1\//.test(url.pathname)) {
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1")
      return route.continue();
    return route.abort();
  }
  if (req.method() === "OPTIONS") {
    await route.fulfill({
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "*",
      },
    });
    return;
  }
  if (url.pathname === "/auth/v1/authorize") {
    googleRequests.push(url);
    return route.fulfill({ status: 302, headers: { location: url.searchParams.get("redirect_to") + "#error=access_denied" } });
  }
  const user = {
    id: sessionUserId,
    email: "prueba@example.com",
    aud: "authenticated",
    role: "authenticated",
    app_metadata: {},
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
  const response = (data) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  if (url.pathname.includes("/auth/v1/token"))
    return response({
      access_token: "test-access-token",
      refresh_token: "test-refresh-token",
      expires_in: 3600,
      token_type: "bearer",
      user,
    });
  if (url.pathname.includes("/auth/v1/user")) return response(user);
  if (url.pathname.includes("/auth/v1/logout")) return response({});
  if (url.pathname.endsWith("/rpc/create_family")) {
    const body = req.postDataJSON();
    const id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    tables.families = [{ id, name: body.family_name, owner_id: user.id }];
    tables.family_members = [
      { family_id: id, user_id: user.id, display_name: body.member_name },
    ];
    if (body.share_existing)
      for (const t of ["movements", "categories", "budgets"])
        tables[t].forEach((r) => {
          r.family_id = id;
        });
    return response(id);
  }
  // Mismo cálculo que payment_balances en SQL, sobre las tablas simuladas.
  if (url.pathname.endsWith("/rpc/payment_balances")) {
    const { today } = req.postDataJSON();
    const cents = (v) => Math.round(Number(v) * 100);
    return response(
      tables.payment_methods
        .filter((p) => p.opening_balance != null)
        .map((p) => {
          const inRange = (r) => r.date >= p.balance_date && r.date <= today;
          let total = cents(p.opening_balance);
          for (const m of tables.movements)
            if (m.payment_method_id === p.id && m.currency === p.currency && inRange(m))
              total += (m.kind === "income" ? 1 : -1) * cents(m.amount);
          for (const t of tables.transfers)
            if (inRange(t))
              total += (t.to_method_id === p.id ? 1 : t.from_method_id === p.id ? -1 : 0) * cents(t.amount);
          return { method_id: p.id, balance: (total / 100).toFixed(2) };
        }),
    );
  }
  if (url.pathname.endsWith("/rpc/create_family_invite"))
    return response("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
  if (url.pathname.endsWith("/rpc/join_family")) {
    assert.equal(
      req.postDataJSON().invite_code,
      "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    );
    joins++;
    return response(tables.families[0].id);
  }
  if (url.pathname.includes("/storage/v1/object/")) {
    if (req.method() === "GET")
      return route.fulfill({
        status: 200,
        contentType: "image/png",
        body: await readFile("public/icons/icon-192.png"),
      });
    if (req.method() === "DELETE") {
      deletedReceipts.push(...req.postDataJSON().prefixes);
      return response([]);
    }
    assert.ok(url.pathname.includes(user.id));
    return response({ Key: url.pathname.split("/object/")[1] });
  }
  const table = url.pathname.split("/").pop();
  if (table === "families") return response(tables.families[0] ?? null);
  if (!(table in tables)) return response({});
  const filter = url.searchParams.get("id")?.replace("eq.", "");
  if (req.method() === "POST") {
    const body = req.postDataJSON();
    const items = (Array.isArray(body) ? body : [body]).map((item, i) => {
      if (table === "movements" || table === "budgets")
        assert.equal(typeof item.amount, "string");
      return {
        user_id: user.id,
        created_at: new Date().toISOString(),
        ...item,
        id: item.id ?? `id-${Date.now()}-${i}`,
      };
    });
    tables[table].push(...items);
    return response(items);
  }
  if (req.method() === "PATCH") {
    const row = tables[table].find((x) => x.id === filter);
    Object.assign(row, req.postDataJSON());
    return response([row]);
  }
  if (req.method() === "DELETE") {
    tables[table] = tables[table].filter((x) => x.id !== filter);
    return response(null);
  }
  const familyFilter = url.searchParams.get("family_id");
  return response(
    tables[table].filter(
      (r) =>
        !familyFilter ||
        (familyFilter === "is.null"
          ? r.family_id == null
          : r.family_id === familyFilter.slice(3)),
    ),
  );
});
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(process.env.TEST_BASE_URL || "http://localhost:3001");
  await page.getByRole("button", { name: "Continuar con Google" }).click();
  await page.getByText("No se pudo completar el acceso con Google.", { exact: false }).waitFor();
  assert.equal(googleRequests.length, 1);
  assert.equal(googleRequests[0].searchParams.get("provider"), "google");
  assert.equal(new URL(googleRequests[0].searchParams.get("redirect_to")).origin, new URL(page.url()).origin);
  await page.getByLabel("Correo electrónico").fill("prueba@example.com");
  await page.getByLabel("Contraseña", { exact: true }).fill("clave-de-prueba");
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await page
    .getByRole("heading", { name: "Tus finanzas, en orden." })
    .waitFor();
  await page.reload();
  await page.getByRole("heading", { name: "Tus finanzas, en orden." }).waitFor();
  assert.equal(await page.getByLabel("Correo electrónico").count(), 0, "La sesión sobrevive a recargar");
  await page.getByRole("button", { name: "Nuevo movimiento" }).click();
  await page.getByLabel("Ítem o nombre de la compra").fill("Compra de prueba");
  await page.getByLabel("Importe", { exact: false }).fill("1234,56");
  // El importe va primero y la categoría se elige buscando.
  assert.ok(
    (await page.locator("dialog input[name=amount]").boundingBox()).y <
      (await page.locator("dialog input[name=name]").boundingBox()).y,
  );
  await page.getByLabel("Categoría", { exact: true }).fill("super");
  assert.equal(await page.locator("dialog .chip").count(), 2);
  await page
    .locator("dialog")
    .getByRole("button", { name: "Supermercado", exact: true })
    .click();
  await page.locator("dialog summary").click();
  await page.locator('input[name="reference"]').fill("Transferencia 123");
  assert.equal(await page.locator('input[type="file"]').count(), 0);
  await page.getByRole("button", { name: "Guardar movimiento" }).click();
  await page.getByRole("button", { name: /Compra de prueba/ }).waitFor();
  assert.equal(tables.movements[0].amount, "1234.56");
  assert.equal(tables.movements[0].reference, "Transferencia 123");
  await page.getByRole("button", { name: /Compra de prueba/ }).click();
  await page.getByText("Transferencia 123", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await page.getByLabel("Importe", { exact: false }).fill("2000,10");
  await page.getByRole("button", { name: "Guardar movimiento" }).click();
  await page.getByRole("button", { name: /Compra de prueba/ }).waitFor();
  assert.equal(tables.movements[0].amount, "2000.10");
  await page.getByRole("button", { name: "USD", exact: true }).click();
  await page
    .getByRole("heading", { name: "Todavía no hay movimientos" })
    .waitFor();
  await page.getByRole("button", { name: "Nuevo movimiento" }).click();
  await page
    .locator("dialog")
    .getByRole("button", { name: "Ingreso", exact: true })
    .click();
  await page.getByLabel("Concepto").fill("Ingreso USD de prueba");
  await page.getByLabel("Importe", { exact: false }).fill("300");
  await page.getByRole("button", { name: "Guardar movimiento" }).click();
  await page.getByRole("button", { name: /Ingreso USD de prueba/ }).waitFor();
  // Cuotas: un total se reparte en un movimiento por mes.
  await page.getByRole("button", { name: "Nuevo movimiento" }).click();
  await page.getByLabel("Ítem o nombre de la compra").fill("Notebook");
  await page.getByLabel("Importe", { exact: false }).fill("1.000");
  await page
    .locator("dialog")
    .getByRole("button", { name: "Supermercado", exact: true })
    .click();
  await page.locator("dialog summary").click();
  await page.locator("select[name=repeat]").selectOption("installments");
  await page.locator("input[name=repeat_count]").fill("3");
  await page.getByRole("button", { name: "Guardar movimiento" }).click();
  await page.getByText("Se cargaron 3 movimientos", { exact: false }).waitFor();
  const installments = tables.movements.filter((m) => m.name.startsWith("Notebook"));
  assert.deepEqual(
    installments.map((m) => [m.name, m.amount]),
    [
      ["Notebook (cuota 1/3)", "333.33"],
      ["Notebook (cuota 2/3)", "333.33"],
      ["Notebook (cuota 3/3)", "333.34"],
    ],
  );
  assert.equal(new Set(installments.map((m) => m.date.slice(0, 7))).size, 3);
  // Categoría nueva escrita en el mismo formulario; sin ítem, el movimiento toma su nombre.
  await page.getByRole("button", { name: "Nuevo movimiento" }).click();
  await page.getByLabel("Importe", { exact: false }).fill("450");
  await page.getByLabel("Categoría", { exact: true }).fill("Kiosco nuevo");
  await page.getByRole("button", { name: "Crear “Kiosco nuevo”" }).click();
  await page.getByText("Nueva categoría:", { exact: false }).waitFor();
  await page.getByRole("button", { name: "Guardar movimiento" }).click();
  await page.getByRole("button", { name: /Kiosco nuevo/ }).first().waitFor();
  const created = tables.categories.find((c) => c.name === "Kiosco nuevo");
  assert.equal(created.kind, "expense");
  assert.match(created.color, /^#[0-9a-f]{6}$/);
  const quick = tables.movements.find((m) => m.name === "Kiosco nuevo");
  assert.equal(quick.category_id, created.id);
  assert.equal(quick.amount, "450.00");
  // Medios de pago cargados a mano: alta rápida, compra en cuotas y total comprometido.
  await page.getByRole("button", { name: "Medios de pago", exact: true }).click();
  assert.equal(new URL(page.url()).searchParams.get("tab"), "medios");
  await page.getByRole("button", { name: "+ Mercado Pago" }).click();
  await page.getByRole("button", { name: "Editar Mercado Pago" }).waitFor();
  assert.equal(tables.payment_methods[0].kind, "wallet");
  await page.getByRole("button", { name: "Agregar movimiento" }).click();
  await page.getByLabel("Importe", { exact: false }).fill("600");
  await page
    .locator("dialog")
    .getByRole("button", { name: "Supermercado", exact: true })
    .click();
  await page
    .locator("dialog")
    .getByRole("button", { name: "Mercado Pago", exact: true })
    .click();
  await page.getByLabel("Ítem o nombre de la compra").fill("Auriculares");
  await page.locator("dialog summary").click();
  await page.locator("select[name=repeat]").selectOption("installments");
  await page.locator("input[name=repeat_count]").fill("2");
  await page.getByRole("button", { name: "Guardar movimiento" }).click();
  await page.getByText("Se cargaron 2 movimientos", { exact: false }).waitFor();
  const paid = tables.movements.filter((m) => m.name.startsWith("Auriculares"));
  assert.equal(paid.length, 2);
  assert.ok(paid.every((m) => m.payment_method_id === tables.payment_methods[0].id));
  assert.match(await page.locator(".method-total").innerText(), /US\$ 300,00/);
  assert.match(await page.locator(".method-pending").innerText(), /1 pago futuro[\s\S]*US\$ 300,00/);
  // Dictado con IA: la frase completa el formulario y no se guarda hasta confirmar.
  await page.getByRole("button", { name: "Agregar movimiento" }).click();
  await page
    .getByLabel("Decilo con tus palabras")
    .fill("mil ochocientos con cincuenta de yerba en el super con mercado pago en 3 cuotas");
  await page.getByRole("button", { name: "Interpretar la frase" }).click();
  await page.getByText("Listo. Revisá los datos y guardá.").waitFor();
  assert.equal(await page.locator("dialog input[name=amount]").inputValue(), "1.800,50");
  assert.equal(await page.locator("dialog input[name=name]").inputValue(), "Yerba");
  assert.equal(
    await page.locator("dialog input[name=category_id]").inputValue(),
    "c1",
  );
  assert.equal(
    await page.locator("dialog input[name=payment_method_id]").inputValue(),
    tables.payment_methods[0].id,
  );
  assert.equal(await page.locator("dialog select[name=repeat]").inputValue(), "installments");
  assert.equal(await page.locator("dialog input[name=repeat_count]").inputValue(), "3");
  const before = tables.movements.length;
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.locator("dialog").waitFor({ state: "detached" });
  assert.equal(tables.movements.length, before, "interpretar no guarda nada");
  // Cuenta con saldo: saldo inicial, un gasto y una transferencia a Mercado Pago.
  await page.getByRole("button", { name: "Nuevo medio de pago" }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Banco");
  await page.locator("dialog select[name=kind]").selectOption("debit");
  await page.locator("dialog select[name=currency]").selectOption("USD");
  await page.getByLabel("Llevar el saldo de esta cuenta").check();
  await page.getByLabel("Saldo inicial").fill("1.000");
  await page.getByRole("button", { name: "Guardar medio de pago" }).click();
  await page.getByRole("button", { name: "Editar Banco" }).waitFor();
  const bank = tables.payment_methods.find((p) => p.name === "Banco");
  assert.equal(bank.opening_balance, "1000.00");
  assert.equal(bank.currency, "USD");
  assert.match(await page.locator(".balance-grid").innerText(), /US\$ 1\.000,00/);
  await page.getByRole("button", { name: "Editar Mercado Pago" }).click();
  await page.locator("dialog select[name=currency]").selectOption("USD");
  await page.getByLabel("Llevar el saldo de esta cuenta").check();
  await page.getByLabel("Saldo inicial").fill("0");
  await page.getByRole("button", { name: "Guardar medio de pago" }).click();
  // Mercado Pago ya tenía la cuota de hoy: 0 − 300.
  await page.getByText("−US$ 300,00").first().waitFor();
  await page.getByRole("button", { name: "Transferir o pagar tarjeta" }).click();
  await page.getByLabel("Importe", { exact: false }).fill("400");
  await page.locator("dialog select[name=from_method_id]").selectOption(bank.id);
  await page.locator("dialog select[name=to_method_id]").selectOption({ label: "Mercado Pago" });
  await page.getByRole("button", { name: "Guardar transferencia" }).click();
  await page.getByText("Transferencia registrada.").waitFor();
  assert.equal(tables.transfers[0].amount, "400.00");
  // Banco 1000 − 400; Mercado Pago −300 + 400; el total no cambia por transferir.
  await page.getByText("US$ 600,00").first().waitFor();
  await page.getByText("US$ 100,00").first().waitFor();
  assert.match(await page.locator(".balance-grid").innerText(), /US\$ 700,00/);
  // Tarjeta con cierre: la compra de hoy cae en el resumen que corresponde.
  await page.getByRole("button", { name: "+ Tarjeta de crédito" }).click();
  await page.getByRole("button", { name: "Editar Tarjeta de crédito" }).click();
  await page.getByLabel("Día de cierre").fill("1");
  await page.getByLabel("Día de vencimiento").fill("10");
  await page.getByRole("button", { name: "Guardar medio de pago" }).click();
  await page.locator(".statement").waitFor();
  assert.match(await page.locator(".statement").innerText(), /Cierra el 1\/\d+ · vence el 10\/\d+/);
  await page.getByRole("button", { name: "Resumen", exact: true }).click();
  // Sin categoría, un gasto no se guarda.
  await page.getByRole("button", { name: "Nuevo movimiento" }).click();
  await page.getByLabel("Importe", { exact: false }).fill("10");
  await page.getByRole("button", { name: "Guardar movimiento" }).click();
  await page.getByText("Elegí una categoría o escribí una nueva.").waitFor();
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.locator("dialog").waitFor({ state: "detached" });
  // El botón atrás cierra el diálogo sin salir de la app.
  await page.getByRole("button", { name: "Nuevo movimiento" }).click();
  await page.locator("dialog").waitFor();
  await page.goBack();
  await page.locator("dialog").waitFor({ state: "detached" });
  await page.getByRole("heading", { name: "Tus finanzas, en orden." }).waitFor();
  await page.getByRole("button", { name: "ARS", exact: true }).click();
  await page.getByRole("button", { name: "Presupuestos", exact: true }).click();
  assert.equal(new URL(page.url()).searchParams.get("tab"), "presupuestos");
  await page.getByRole("button", { name: "Nuevo presupuesto" }).click();
  await page.locator("select[name=category_id]").selectOption("c1");
  await page.getByLabel("Presupuesto", { exact: true }).fill("5000");
  await page.getByRole("button", { name: "Guardar presupuesto" }).click();
  await page.getByText("40%", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Categorías", exact: true }).click();
  await page.getByRole("button", { name: "Nueva categoría" }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Transporte prueba");
  await page.getByRole("button", { name: "Guardar categoría" }).click();
  await page.getByRole("button", { name: /Transporte prueba/ }).waitFor();
  await page.getByRole("button", { name: /Transporte prueba/ }).click();
  await page.getByLabel("Categoría activa").uncheck();
  await page.getByRole("button", { name: "Guardar categoría" }).click();
  await page
    .getByRole("button", { name: /Transporte prueba.*Desactivada/ })
    .waitFor();
  await page.getByRole("button", { name: "Resumen", exact: true }).click();
  const period = await page.locator("#period").inputValue();
  const days = new Date(
    Number(period.slice(0, 4)),
    Number(period.slice(5, 7)),
    0,
  ).getDate();
  await page.locator(".daily-chart .recharts-surface").waitFor();
  assert.equal(
    await page.getByLabel("Ver detalle de un día").locator("option").count(),
    days + 1,
  );
  await page.getByLabel("Ver detalle de un día").selectOption({ index: 1 });
  await page.locator(".chart-detail").waitFor();
  await page
    .getByLabel("Ver detalle de un día")
    .selectOption(tables.movements[0].date);
  assert.match(
    await page.locator(".chart-detail").innerText(),
    /Gastos: \$ 2\.000,10/,
  );
  assert.match(
    await page.locator(".chart-detail").innerText(),
    /Ingresos: \$ 0,00/,
  );
  await page.locator(".recharts-donut .recharts-pie-sector").first().hover({ position: { x: 100, y: 14 } });
  await page.locator(".recharts-donut .finance-chart-tooltip").waitFor();
  assert.match(
    await page.locator(".recharts-donut .finance-chart-tooltip").innerText(),
    /2\.000,10/,
  );
  await page.getByRole("heading", { name: "Tus finanzas, en orden." }).hover();
  await page.getByRole("button", { name: /Supermercado.*100,0%/ }).click();
  assert.match(await page.locator(".recharts-donut-total").innerText(), /Supermercado/);
  await page.getByRole("button", { name: "Ver total de gastos", exact: true }).click();
  assert.match(await page.locator(".recharts-donut-total").innerText(), /Total de gastos/);
  await mkdir("test-results", { recursive: true });
  await page.screenshot({
    path: "test-results/desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
    "Sin overflow global en celular",
  );
  await page.getByRole("button", { name: "Abrir menú" }).click();
  await page
    .locator("aside")
    .getByRole("button", { name: /^(Vista anual|Ver gastos)$/ })
    .click();
  await page.locator(".recharts-evolution .recharts-surface").waitFor();
  assert.equal(
    await page.getByLabel("Ver detalle de un mes").locator("option").count(),
    13,
  );
  await page.getByText("Saldo del año", { exact: true }).waitFor();
  await page
    .getByRole("heading", { name: "Gastos del año por categoría" })
    .waitFor();
  await page.getByText("Total anual", { exact: true }).waitFor();
  assert.equal(await page.locator("tbody tr").count(), 13);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
    "Tabla anual dentro de su scroll",
  );
  await page.getByRole("button", { name: "Abrir menú" }).click();
  await page.getByRole("button", { name: "Movimientos", exact: true }).click();
  await page.getByRole("button", { name: /Compra de prueba/ }).click();
  await page.getByRole("button", { name: "Eliminar movimiento" }).click();
  await page
    .getByRole("heading", { name: "Todavía no hay movimientos" })
    .waitFor();
  await page.getByRole("button", { name: "Deshacer", exact: true }).click();
  await page.getByRole("button", { name: /Compra de prueba/ }).waitFor();
  assert.equal(tables.movements.length, 8, "Deshacer preserva el movimiento");
  await page.getByRole("button", { name: /Compra de prueba/ }).click();
  await page.getByRole("button", { name: "Eliminar movimiento" }).click();
  await page
    .getByRole("heading", { name: "Todavía no hay movimientos" })
    .waitFor();
  // La baja llega al servidor cuando vence el plazo para deshacer.
  await page.waitForTimeout(7000);
  assert.equal(tables.movements.length, 7);
  assert.equal(deletedReceipts.length, 0);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .locator("aside")
    .getByRole("button", { name: "Grupo Familiar", exact: true })
    .click();
  await page.locator('input[name="family_name"]').fill("Familia de prueba");
  await page
    .locator("form")
    .filter({ has: page.locator('input[name="family_name"]') })
    .locator('input[name="member_name"]')
    .fill("Ana");
  await page
    .getByRole("button", { name: "Crear grupo familiar", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Familia de prueba", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Generar invitación" }).click();
  const sharedLink = await page.getByLabel("Enlace de invitación").inputValue();
  assert.equal(new URL(sharedLink).pathname, "/unirse");
  assert.equal(
    new URL(sharedLink).hash,
    "#bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  );
  const secondAuthor = "33333333-3333-3333-3333-333333333333";
  tables.family_members.push({
    user_id: secondAuthor,
    family_id: tables.families[0].id,
    display_name: "Carla",
  });
  for (const [id, author, name] of [
    ["expense-ana", sessionUserId, "Gasto de Ana"],
    ["expense-carla", secondAuthor, "Gasto de Carla"],
  ]) {
    tables.movements.push({
      id,
      user_id: author,
      family_id: tables.families[0].id,
      date: tables.movements[0].date,
      name,
      amount: "20.00",
      currency: "ARS",
      kind: "expense",
      category_id: tables.categories[0].id,
      note: "",
      reference: "",
      receipt_path: null,
    });
  }
  await page.getByRole("button", { name: "Actualizar datos" }).click();
  await page.getByRole("button", { name: "Movimientos", exact: true }).click();
  await page.getByLabel("Filtrar por integrante").selectOption(secondAuthor);
  await page.getByRole("button", { name: /Gasto de Carla/ }).waitFor();
  assert.equal(await page.locator(".movement").count(), 1);
  assert.equal(
    await page.getByText("Cargado por Carla", { exact: true }).count(),
    1,
  );
  await page.getByRole("button", { name: /Gasto de Carla/ }).click();
  assert.equal(
    await page
      .locator("dialog dd")
      .filter({ hasText: /^Carla$/ })
      .count(),
    1,
  );
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.locator("dialog").waitFor({ state: "detached" });
  await page.getByLabel("Filtrar por integrante").selectOption(sessionUserId);
  await page.getByRole("button", { name: /Gasto de Ana/ }).waitFor();
  assert.equal(await page.locator(".movement").count(), 1);
  await page.getByLabel("Filtrar por integrante").selectOption("all");
  assert.equal(await page.locator(".movement").count(), 2);
  await page.getByLabel("Espacio de finanzas").selectOption("personal");
  await page.getByRole("button", { name: "Resumen", exact: true }).click();
  await page
    .getByRole("heading", { name: "Todavía no hay movimientos" })
    .waitFor();
  await page.getByLabel("Espacio de finanzas").selectOption("family");
  await page.goto(
    new URL("/gasto", process.env.TEST_BASE_URL || "http://localhost:3001")
      .href,
  );
  await page
    .getByRole("heading", { name: "Agregar gasto", exact: true })
    .waitFor();
  assert.equal(await page.locator('dialog select[name="kind"]').count(), 0);
  assert.equal(
    await page.locator('dialog input[name="kind"]').inputValue(),
    "expense",
  );
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.locator("dialog").waitFor({ state: "detached" });
  await page.goto(
    new URL("/panel", process.env.TEST_BASE_URL || "http://localhost:3001")
      .href,
  );
  await page
    .getByRole("heading", { name: "Tus finanzas, en orden." })
    .waitFor();
  assert.equal(await page.locator("dialog").count(), 0);
  // Otro integrante abre el enlace sin sesión. Autenticar no consume la invitación.
  await page.evaluate(() => localStorage.clear());
  sessionUserId = "22222222-2222-2222-2222-222222222222";
  await page.goto(sharedLink);
  await page.getByLabel("Correo electrónico").fill("familiar@example.com");
  await page.getByLabel("Contraseña", { exact: true }).fill("clave-de-prueba");
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await page
    .getByRole("heading", { name: "Unirme a mi familia", exact: true })
    .waitFor();
  assert.equal(joins, 0);
  await page.reload();
  await page.getByLabel("Tu nombre", { exact: true }).fill("Beto");
  await page
    .getByRole("button", { name: "Unirme al grupo", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Ya sos parte de la familia" })
    .waitFor();
  assert.equal(joins, 1);
  assert.equal(
    await page.evaluate(() => localStorage.getItem("clara:pending-invitation")),
    null,
  );
  assert.deepEqual(errors, []);
  console.log(
    "UI OK: login, vacío, alta/edición/baja con deshacer, cuotas, monedas, presupuestos, categorías, vista anual, historial y responsive.",
  );
} finally {
  await browser.close();
}
