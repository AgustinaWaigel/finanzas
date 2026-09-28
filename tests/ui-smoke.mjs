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
const deletedReceipts = [];
const tables = {
  movements: [],
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
  const user = {
    id: "11111111-1111-1111-1111-111111111111",
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
  if (!(table in tables)) return response({});
  const filter = url.searchParams.get("id")?.replace("eq.", "");
  if (req.method() === "POST") {
    const body = req.postDataJSON();
    if (table === "movements" || table === "budgets")
      assert.equal(typeof body.amount, "string");
    tables[table].push({ ...body, id: `id-${Date.now()}` });
    return response(null);
  }
  if (req.method() === "PATCH") {
    Object.assign(
      tables[table].find((x) => x.id === filter),
      req.postDataJSON(),
    );
    return response(null);
  }
  if (req.method() === "DELETE") {
    tables[table] = tables[table].filter((x) => x.id !== filter);
    return response(null);
  }
  return response(tables[table]);
});
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(process.env.TEST_BASE_URL || "http://localhost:3001");
  await page.getByLabel("Correo electrónico").fill("prueba@example.com");
  await page.getByLabel("Contraseña", { exact: true }).fill("clave-de-prueba");
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await page
    .getByRole("heading", { name: "Tus finanzas, en orden." })
    .waitFor();
  await page.getByRole("button", { name: "Nuevo movimiento" }).click();
  await page.getByLabel("Ítem o nombre de la compra").fill("Compra de prueba");
  await page.getByLabel("Importe", { exact: false }).fill("1234,56");
  await page.locator("select[name=category_id]").selectOption("c1");
  await page
    .locator('input[name="receipt"]')
    .setInputFiles("public/icons/icon-192.png");
  await page.getByRole("button", { name: "Guardar movimiento" }).click();
  await page.getByRole("button", { name: /Compra de prueba/ }).waitFor();
  assert.equal(tables.movements[0].amount, "1234.56");
  assert.ok(
    tables.movements[0].receipt_path.startsWith(
      "11111111-1111-1111-1111-111111111111/",
    ),
  );
  await page.getByRole("button", { name: /Compra de prueba/ }).click();
  await page.getByRole("img", { name: "Ticket de Compra de prueba" }).waitFor();
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
  await page.locator("select[name=kind]").selectOption("income");
  await page
    .getByLabel("Concepto", { exact: true })
    .fill("Ingreso USD de prueba");
  await page.getByLabel("Importe", { exact: false }).fill("300");
  await page.getByRole("button", { name: "Guardar movimiento" }).click();
  await page.getByRole("button", { name: /Ingreso USD de prueba/ }).waitFor();
  await page.getByRole("button", { name: "ARS", exact: true }).click();
  await page.getByRole("button", { name: "Presupuestos", exact: true }).click();
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
  assert.equal(await page.locator(".daily-chart button").count(), days);
  await page.locator(".daily-chart button").first().click();
  await page.locator(".chart-detail").waitFor();
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
    .getByRole("button", { name: "Vista anual", exact: true })
    .click();
  assert.equal(await page.locator(".interactive-chart button").count(), 12);
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
  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("button", { name: "Eliminar movimiento" }).click();
  assert.equal(tables.movements.length, 2, "Cancelar preserva el movimiento");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Eliminar movimiento" }).click();
  await page
    .getByRole("heading", { name: "Todavía no hay movimientos" })
    .waitFor();
  assert.equal(tables.movements.length, 1);
  assert.equal(deletedReceipts.length, 1);
  assert.deepEqual(errors, []);
  console.log(
    "UI OK: login, vacío, alta/edición/baja, monedas, presupuestos, categorías, vista anual y responsive.",
  );
} finally {
  await browser.close();
}
