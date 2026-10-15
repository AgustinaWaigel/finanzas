import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
test("medios de pago: aislamiento, espacios, grupo familiar y borrados", async () => {
  const db = new PGlite();
  const a = "11111111-1111-1111-1111-111111111111",
    b = "22222222-2222-2222-2222-222222222222";
  const as = (id: string) =>
    db.exec(`set role authenticated;set request.jwt.claim.sub='${id}';`);
  const count = async (sql: string) => (await db.query(sql)).rows.length;
  const one = async (sql: string) =>
    (await db.query<{ id: string }>(sql)).rows[0].id;
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;create schema storage;
 create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
 grant usage on schema auth,public,storage to authenticated;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;grant select,insert,delete on storage.objects to authenticated;
 create function storage.foldername(text) returns text[] language sql immutable as 'select string_to_array($1,''/'')';`);
    for (const file of [
      "202609280001_initial.sql",
      "202609280002_families.sql",
      "202609280003_reference_repair.sql",
      "202610090004_family_management.sql",
      "202610090005_payment_methods.sql",
    ])
      await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
    await db.exec(`insert into auth.users values('${a}'),('${b}');`);

    await as(a);
    const cat = await one("select id from categories limit 1");
    const card = await one(
      `insert into payment_methods(name,kind) values('Visa','credit') returning id`,
    );
    const wallet = await one(
      `insert into payment_methods(name,kind) values('Mercado Pago','wallet') returning id`,
    );
    await assert.rejects(
      () => db.exec(`insert into payment_methods(name,kind) values('visa','debit')`),
      "mismo nombre en el mismo espacio",
    );
    await assert.rejects(() =>
      db.exec(`insert into payment_methods(name,kind) values('Rara','crypto')`),
    );
    await db.exec(
      `insert into movements(date,name,amount,currency,kind,category_id,payment_method_id) values
       ('2026-10-01','Cuota 1',100,'ARS','expense','${cat}','${card}'),
       ('2026-11-01','Cuota 2',100,'ARS','expense','${cat}','${card}'),
       ('2026-10-02','Café',5,'ARS','expense','${cat}','${wallet}');`,
    );

    // Otra persona no ve ni puede usar los medios ajenos.
    await as(b);
    assert.equal(await count("select 1 from payment_methods"), 0);
    const catB = await one("select id from categories limit 1");
    await assert.rejects(() =>
      db.exec(
        `insert into movements(date,name,amount,currency,kind,category_id,payment_method_id) values('2026-10-01','Ajeno',1,'ARS','expense','${catB}','${card}')`,
      ),
    );
    assert.equal(
      await count(`update payment_methods set name='Robada' returning id`),
      0,
    );

    // Un medio desactivado conserva su historial pero no admite movimientos nuevos.
    await as(a);
    await db.exec(`update payment_methods set active=false where id='${wallet}'`);
    await assert.rejects(() =>
      db.exec(
        `insert into movements(date,name,amount,currency,kind,category_id,payment_method_id) values('2026-10-03','Nuevo',1,'ARS','expense','${cat}','${wallet}')`,
      ),
    );
    await db.exec(`update movements set note='sigue editable' where name='Café'`);
    await assert.rejects(() =>
      db.exec(`update payment_methods set user_id='${b}' where id='${card}'`),
    );

    // Borrar un medio deja los movimientos, sin medio asignado.
    await db.exec(`delete from payment_methods where id='${wallet}'`);
    assert.equal(
      await count(
        "select 1 from movements where name='Café' and payment_method_id is null",
      ),
      1,
    );

    // Al compartir el historial, los medios pasan al grupo junto con sus movimientos.
    const family = await one(
      `select public.create_family('Familia','Ana',true) as id`,
    );
    assert.equal(
      await count(
        `select 1 from payment_methods where family_id='${family}' and id='${card}'`,
      ),
      1,
    );
    assert.equal(
      await count(`select 1 from movements where payment_method_id='${card}'`),
      2,
    );
    const token = (
      await db.query<{ token: string }>(
        "select public.create_family_invite() as token",
      )
    ).rows[0].token;
    await as(b);
    await db.exec(`select public.join_family('${token}','Beto')`);
    assert.equal(await count("select 1 from payment_methods"), 1);
    const shared = await one(
      `select id from categories where family_id='${family}' limit 1`,
    );
    await db.exec(
      `insert into movements(family_id,date,name,amount,currency,kind,category_id,payment_method_id) values('${family}','2026-10-04','De B',9,'ARS','expense','${shared}','${card}')`,
    );
    // Un medio del grupo no sirve en el espacio personal.
    await assert.rejects(() =>
      db.exec(
        `insert into movements(date,name,amount,currency,kind,category_id,payment_method_id) values('2026-10-04','Cruce',9,'ARS','expense','${catB}','${card}')`,
      ),
    );
    await db.exec(
      `insert into payment_methods(name,kind) values('Efectivo','cash')`,
    );

    // B borra su cuenta: lo personal se va, lo del grupo queda.
    await db.exec(`select public.delete_account()`);
    await db.exec("reset role");
    assert.equal(
      await count(`select 1 from public.payment_methods where name='Efectivo'`),
      0,
    );
    assert.equal(
      await count(`select 1 from public.movements where name='De B'`),
      1,
    );

    // Eliminar el grupo también elimina sus medios de pago.
    await as(a);
    await db.exec(`select public.delete_family()`);
    await db.exec("reset role");
    assert.equal(await count("select 1 from public.payment_methods"), 0);
    assert.equal(await count("select 1 from public.families"), 0);
  } finally {
    await db.close();
  }
});
