import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  statementMonth,
  statementDates,
  parseBalance,
} from "../src/features/finance/model";

test("tarjetas: a qué resumen va cada compra y cuándo vence", () => {
  // Cierra el 25: lo comprado hasta el 25 entra en el resumen de ese mes.
  assert.equal(statementMonth("2026-10-25", 25), "2026-10");
  assert.equal(statementMonth("2026-10-26", 25), "2026-11");
  assert.equal(statementMonth("2026-12-28", 25), "2027-01");
  // Un cierre el 31 se acomoda a los meses más cortos.
  assert.equal(statementMonth("2026-02-28", 31), "2026-02");
  assert.equal(statementMonth("2026-04-30", 31), "2026-04");
  // Sin día de cierre, cuenta el mes calendario.
  assert.equal(statementMonth("2026-10-26", null), "2026-10");
  assert.deepEqual(statementDates("2026-10", 25, 5), {
    closes: "2026-10-25",
    due: "2026-11-05",
  });
  // Vencimiento posterior al cierre dentro del mismo mes.
  assert.deepEqual(statementDates("2026-10", 10, 20), {
    closes: "2026-10-10",
    due: "2026-10-20",
  });
  assert.deepEqual(statementDates("2026-12", 28, 8), {
    closes: "2026-12-28",
    due: "2027-01-08",
  });
  assert.deepEqual(statementDates("2026-02", 31, null), {
    closes: "2026-02-28",
    due: null,
  });
});

test("saldo inicial: admite cero y negativos", () => {
  assert.equal(parseBalance("0"), "0.00");
  assert.equal(parseBalance("1.250,50"), "1250.50");
  assert.equal(parseBalance("-300"), "-300.00");
  assert.equal(parseBalance("−300,5"), "-300.50");
  assert.throws(() => parseBalance("abc"));
  assert.throws(() => parseBalance(""));
});

test("cuentas: saldos, transferencias, pago de tarjeta y aislamiento", async () => {
  const db = new PGlite();
  const a = "11111111-1111-1111-1111-111111111111",
    b = "22222222-2222-2222-2222-222222222222";
  const as = (id: string) =>
    db.exec(`set role authenticated;set request.jwt.claim.sub='${id}';`);
  const one = async (sql: string) =>
    (await db.query<{ id: string }>(sql)).rows[0].id;
  const balances = async (space = "null") =>
    Object.fromEntries(
      (
        await db.query<{ method_id: string; balance: string }>(
          `select * from public.payment_balances(${space},'2026-10-31')`,
        )
      ).rows.map((r) => [r.method_id, r.balance]),
    );
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;create schema storage;
 create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
 grant usage on schema auth,public,storage to authenticated;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;grant select,insert,delete on storage.objects to authenticated;
 create function storage.foldername(text) returns text[] language sql immutable as 'select string_to_array($1,''/'')';`);
    // Todas las migraciones, en orden: así se detecta si una nueva queda fuera de la secuencia.
    for (const file of readdirSync("supabase/migrations").sort())
      await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
    await db.exec(`insert into auth.users values('${a}'),('${b}');`);

    await as(a);
    const cat = await one("select id from categories limit 1");
    const bank = await one(
      `insert into payment_methods(name,kind,currency,opening_balance,balance_date) values('Banco','debit','ARS',1000,'2026-10-01') returning id`,
    );
    const wallet = await one(
      `insert into payment_methods(name,kind,currency,opening_balance,balance_date) values('Mercado Pago','wallet','ARS',0,'2026-10-01') returning id`,
    );
    const usd = await one(
      `insert into payment_methods(name,kind,currency,opening_balance,balance_date) values('Dólares','cash','USD',50,'2026-10-01') returning id`,
    );
    const card = await one(
      `insert into payment_methods(name,kind,closing_day,due_day) values('Visa','credit',25,5) returning id`,
    );
    const label = await one(
      `insert into payment_methods(name,kind) values('Efectivo','cash') returning id`,
    );
    // Reglas de forma.
    await assert.rejects(() =>
      db.exec(
        `insert into payment_methods(name,kind,currency,opening_balance,balance_date) values('Master','credit','ARS',10,'2026-10-01')`,
      ),
    );
    await assert.rejects(() =>
      db.exec(`insert into payment_methods(name,kind,closing_day) values('Caja','cash',10)`),
    );
    await assert.rejects(() =>
      db.exec(`insert into payment_methods(name,kind,opening_balance) values('Sin fecha','cash',10)`),
    );
    await assert.rejects(() =>
      db.exec(`insert into payment_methods(name,kind,closing_day) values('Amex','credit',32)`),
    );

    await db.exec(
      `insert into movements(date,name,amount,currency,kind,category_id,payment_method_id) values
       ('2026-09-30','Antes del saldo inicial',999,'ARS','expense','${cat}','${bank}'),
       ('2026-10-02','Super',200.50,'ARS','expense','${cat}','${bank}'),
       ('2026-10-03','Sueldo',5000,'ARS','income',null,'${bank}'),
       ('2026-11-15','Futuro',100,'ARS','expense','${cat}','${bank}'),
       ('2026-10-04','Con tarjeta',700,'ARS','expense','${cat}','${card}'),
       ('2026-10-05','Otra moneda',10,'USD','expense','${cat}','${bank}');
       insert into transfers(date,from_method_id,to_method_id,amount) values
       ('2026-10-06','${bank}','${wallet}',300),
       ('2026-10-10','${bank}','${card}',700),
       ('2026-12-01','${bank}','${wallet}',50);`,
    );
    assert.deepEqual(await balances(), {
      // 1000 − 200,50 + 5000 − 300 (a MP) − 700 (pago de tarjeta)
      [bank]: "4799.50",
      [wallet]: "300",
      [usd]: "50",
    });

    // Transferencias inválidas.
    for (const [from, to] of [
      [bank, usd], // monedas distintas
      [card, bank], // una tarjeta no es origen
      [label, bank], // el origen no lleva moneda
      [bank, bank],
    ])
      await assert.rejects(() =>
        db.exec(
          `insert into transfers(date,from_method_id,to_method_id,amount) values('2026-10-07','${from}','${to}',1)`,
        ),
      );
    await assert.rejects(() =>
      db.exec(
        `insert into transfers(date,from_method_id,to_method_id,amount) values('2026-10-07','${bank}','${wallet}',1.001)`,
      ),
    );
    await assert.rejects(
      () => db.exec(`update transfers set amount=1`),
      "las transferencias no se editan: se borran y se cargan de nuevo",
    );

    // Recordatorios: cada dispositivo pertenece a quien lo activó.
    const device = `insert into push_subscriptions(endpoint,p256dh,auth) values('https://push.example/abc123','${"k".repeat(40)}','${"s".repeat(20)}')`;
    await db.exec(device);
    await db.exec(
      `${device} on conflict(endpoint) do update set endpoint=excluded.endpoint,p256dh=excluded.p256dh,auth=excluded.auth`,
    );
    await as(b);
    assert.equal(
      (await db.query("select 1 from push_subscriptions")).rows.length,
      0,
    );
    await assert.rejects(
      () => db.exec(`${device} on conflict(endpoint) do update set auth=excluded.auth`),
      "no se puede tomar el dispositivo de otra cuenta",
    );
    assert.equal(
      (await db.query("delete from push_subscriptions returning 1")).rows.length,
      0,
    );
    await as(a);
    assert.equal(
      (await db.query("select 1 from push_subscriptions")).rows.length,
      1,
    );

    // Otra persona no ve nada ni puede transferir con cuentas ajenas.
    await as(b);
    assert.deepEqual(await balances(), {});
    assert.equal((await db.query("select 1 from transfers")).rows.length, 0);
    await assert.rejects(() =>
      db.exec(
        `insert into transfers(date,from_method_id,to_method_id,amount) values('2026-10-07','${bank}','${wallet}',1)`,
      ),
    );

    // Al compartir, cuentas y transferencias pasan al grupo y el saldo se conserva.
    await as(a);
    const family = await one(
      `select public.create_family('Familia','Ana',true) as id`,
    );
    assert.deepEqual(await balances(), {});
    assert.equal((await balances(`'${family}'`))[bank], "4799.50");

    // Borrar una cuenta borra sus transferencias; los movimientos quedan sin medio.
    await db.exec(`delete from payment_methods where id='${wallet}'`);
    assert.equal((await db.query("select 1 from transfers")).rows.length, 1);
    assert.equal((await balances(`'${family}'`))[bank], "5099.50");
    await db.exec(`select public.delete_family()`);
    await db.exec("reset role");
    assert.equal(
      (await db.query("select 1 from public.transfers")).rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});
