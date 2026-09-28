import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
test("migración PostgreSQL: RLS, relaciones, precisión, categorías y tickets", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth; create schema storage;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
 grant usage on schema auth,public,storage to authenticated;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;
 grant select,insert,delete on storage.objects to authenticated;
 create function storage.foldername(text) returns text[] language sql immutable as 'select string_to_array($1,''/'')';`);
    await db.exec(
      readFileSync("supabase/migrations/202609280001_initial.sql", "utf8"),
    );
    const alice = "11111111-1111-1111-1111-111111111111",
      bob = "22222222-2222-2222-2222-222222222222";
    await db.exec(
      `insert into auth.users values('${alice}'),('${bob}'); set role authenticated; set request.jwt.claim.sub='${alice}';`,
    );
    const cats = await db.query<{ id: string }>(
      "select id from categories order by name",
    );
    assert.equal(cats.rows.length, 15);
    const category = cats.rows[0].id;
    await db.exec(
      `insert into movements(date,name,amount,currency,kind,category_id) values('2026-09-01','Compra',0.10,'ARS','expense','${category}');`,
    );
    await db.exec(
      `insert into budgets(month,category_id,currency,amount) values('2026-09-01','${category}','ARS',100);`,
    );
    await db.exec(
      `insert into storage.objects(bucket_id,name) values('receipts','${alice}/ticket.png');`,
    );
    await assert.rejects(() =>
      db.exec(
        `insert into movements(date,name,amount,currency,kind,category_id) values('2026-09-01','Inválido',0.001,'ARS','expense','${category}')`,
      ),
    );
    await assert.rejects(() =>
      db.exec(
        `insert into movements(user_id,date,name,amount,currency,kind,category_id) values('${bob}','2026-09-01','Ajeno',10,'ARS','expense','${category}')`,
      ),
    );
    await assert.rejects(() =>
      db.exec(`delete from categories where id='${category}'`),
    );
    await assert.rejects(() =>
      db.exec(`update categories set kind='income' where id='${category}'`),
    );
    await db.exec(
      `update categories set active=false where id='${category}'; update movements set note='Historial conservado';`,
    );
    await assert.rejects(() =>
      db.exec(
        `insert into movements(date,name,amount,currency,kind,category_id) values('2026-09-01','Inactiva',10,'ARS','expense','${category}')`,
      ),
    );
    const amounts = await db.query<{ amount_text: string }>(
      "select amount_text from movements",
    );
    assert.equal(amounts.rows[0].amount_text, "0.10");
    await db.exec(`set request.jwt.claim.sub='${bob}';`);
    assert.equal((await db.query("select * from categories")).rows.length, 15);
    assert.equal((await db.query("select * from movements")).rows.length, 0);
    assert.equal((await db.query("select * from budgets")).rows.length, 0);
    assert.equal(
      (await db.query("select * from storage.objects")).rows.length,
      0,
    );
    assert.equal(
      (await db.query(`update movements set name='Ataque' returning id`)).rows
        .length,
      0,
    );
    assert.equal(
      (await db.query(`delete from movements returning id`)).rows.length,
      0,
    );
    await assert.rejects(() =>
      db.exec(
        `insert into movements(date,name,amount,currency,kind,category_id) values('2026-09-01','Categoría ajena',10,'ARS','expense','${category}')`,
      ),
    );
    await assert.rejects(() =>
      db.exec(
        `insert into storage.objects(bucket_id,name) values('receipts','${alice}/ajeno.png')`,
      ),
    );
    await assert.rejects(() =>
      db.exec(
        `insert into movements(date,name,amount,currency,kind,receipt_path) values('2026-09-01','Ticket ajeno',10,'ARS','income','${alice}/ticket.png')`,
      ),
    );
    await db.exec(
      `set request.jwt.claim.sub='${alice}';delete from movements;delete from budgets;delete from categories where id='${category}';`,
    );
    assert.equal((await db.query("select * from categories")).rows.length, 14);
  } finally {
    await db.close();
  }
});
