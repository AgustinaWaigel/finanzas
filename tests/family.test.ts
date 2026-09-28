import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
test("familias: migración conservadora, colaboración, referencias, aislamiento e invitaciones", async () => {
  const db = new PGlite();
  const a = "11111111-1111-1111-1111-111111111111",
    b = "22222222-2222-2222-2222-222222222222",
    c = "33333333-3333-3333-3333-333333333333";
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;create schema storage;
 create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
 grant usage on schema auth,public,storage to authenticated;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;grant select,insert,delete on storage.objects to authenticated;
 create function storage.foldername(text) returns text[] language sql immutable as 'select string_to_array($1,''/'')';`);
    await db.exec(
      readFileSync("supabase/migrations/202609280001_initial.sql", "utf8"),
    );
    await db.exec(
      `insert into auth.users values('${a}'),('${b}'),('${c}');set role authenticated;set request.jwt.claim.sub='${a}';`,
    );
    const cat = (
      await db.query<{ id: string }>("select id from categories limit 1")
    ).rows[0].id;
    await db.exec(
      `insert into movements(date,name,amount,currency,kind,category_id,receipt_path) values('2026-09-01','Compra previa',10.50,'ARS','expense','${cat}','${a}/legacy.png');insert into storage.objects(bucket_id,name) values('receipts','${a}/legacy.png');`,
    );
    await db.exec("reset role");
    await db.exec(
      readFileSync("supabase/migrations/202609280002_families.sql", "utf8"),
    );
    // Simular una instalación de familias anterior a la columna Referencia.
    await db.exec("alter table public.movements drop column reference");
    const repair = readFileSync(
      "supabase/migrations/202609280003_reference_repair.sql",
      "utf8",
    );
    await db.exec(repair);
    await db.exec(repair); // Repetir la reparación no borra datos ni falla.
    await db.exec(`set role authenticated;set request.jwt.claim.sub='${a}';`);
    assert.equal((await db.query("select * from movements")).rows.length, 1);
    const family = (
      await db.query<{ id: string }>(
        `select public.create_family('Familia A','Ana',true) as id`,
      )
    ).rows[0].id;
    const token = (
      await db.query<{ token: string }>(
        "select public.create_family_invite() as token",
      )
    ).rows[0].token;
    await db.exec(`set request.jwt.claim.sub='${b}'`);
    assert.equal((await db.query("select * from movements")).rows.length, 0);
    await assert.rejects(() =>
      db.exec(
        `insert into family_members(user_id,family_id,display_name) values('${b}','${family}','Intruso')`,
      ),
    );
    await assert.rejects(() =>
      db.exec(
        `select public.join_family('00000000-0000-0000-0000-000000000000','Beto')`,
      ),
    );
    await db.exec(`select public.join_family('${token}','Beto')`);
    assert.equal((await db.query("select * from movements")).rows.length, 1);
    assert.equal(
      (await db.query("select * from storage.objects")).rows.length,
      1,
    );
    assert.equal(
      (await db.query("select * from categories")).rows.length,
      30,
      "personales y familiares accesibles sin mezclarse en UI",
    );
    await db.exec(
      `update movements set name='Editado por integrante',reference='Transferencia 123';`,
    );
    assert.equal(
      (await db.query<{ reference: string }>("select reference from movements"))
        .rows[0].reference,
      "Transferencia 123",
    );
    await assert.rejects(() => db.exec(`update movements set user_id='${b}'`));
    await assert.rejects(() => db.exec(`update movements set family_id=null`));
    await assert.rejects(() =>
      db.exec(
        `insert into movements(date,name,amount,currency,kind,category_id) values('2026-09-01','Cruce',2,'ARS','expense','${cat}')`,
      ),
    );
    await db.exec(
      `insert into movements(family_id,date,name,amount,currency,kind,category_id) values('${family}','2026-09-01','Gasto B',5,'ARS','expense','${cat}');insert into budgets(family_id,month,category_id,currency,amount) values('${family}','2026-09-01','${cat}','ARS',100);`,
    );
    await assert.rejects(() => db.exec(`select public.create_family_invite()`));
    await db.exec(`set request.jwt.claim.sub='${c}'`);
    assert.equal((await db.query("select * from movements")).rows.length, 0);
    assert.equal((await db.query("select * from families")).rows.length, 0);
    assert.equal(
      (await db.query("select * from family_members")).rows.length,
      0,
    );
    assert.equal(
      (await db.query("select * from storage.objects")).rows.length,
      0,
    );
    await assert.rejects(() =>
      db.exec(`select public.join_family('${token}','Cami')`),
    );
    await assert.rejects(() =>
      db.exec(
        `insert into movements(family_id,date,name,amount,currency,kind,category_id) values('${family}','2026-09-01','Intruso',5,'ARS','expense','${cat}')`,
      ),
    );
    await db.exec(
      `set request.jwt.claim.sub='${a}';select public.remove_family_member('${b}');`,
    );
    await db.exec(`set request.jwt.claim.sub='${b}'`);
    assert.equal(
      (await db.query("select * from movements")).rows.length,
      0,
      "ni el autor conserva acceso familiar al salir",
    );
    assert.equal(
      (await db.query("select * from storage.objects")).rows.length,
      0,
    );
    assert.equal(
      (await db.query(`update movements set reference='ataque' returning id`))
        .rows.length,
      0,
    );
    await db.exec(`set request.jwt.claim.sub='${a}'`);
    assert.equal(
      (await db.query("select * from movements")).rows.length,
      2,
      "expulsar conserva historial",
    );
    assert.equal((await db.query("select * from budgets")).rows.length, 1);
    await assert.rejects(() =>
      db.exec(`select public.remove_family_member('${a}')`),
    );
    const next = (
      await db.query<{ token: string }>(
        "select public.create_family_invite() as token",
      )
    ).rows[0].token;
    await db.exec(
      `set request.jwt.claim.sub='${b}';select public.join_family('${next}','Beto');delete from movements;delete from storage.objects;delete from budgets;`,
    );
    assert.equal(
      (await db.query("select * from movements")).rows.length,
      0,
      "integrante puede eliminar movimientos de todos",
    );
    assert.equal(
      (await db.query("select * from storage.objects")).rows.length,
      0,
      "limpieza de tickets previos sigue autorizada",
    );
  } finally {
    await db.close();
  }
});
