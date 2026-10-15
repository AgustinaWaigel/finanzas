import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
test("gestión: transferir administración, eliminar grupo y eliminar cuenta", async () => {
  const db = new PGlite();
  const a = "11111111-1111-1111-1111-111111111111",
    b = "22222222-2222-2222-2222-222222222222",
    c = "33333333-3333-3333-3333-333333333333";
  const as = (id: string) =>
    db.exec(`set role authenticated;set request.jwt.claim.sub='${id}';`);
  const count = async (sql: string) => (await db.query(sql)).rows.length;
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
    ])
      await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
    await db.exec(`insert into auth.users values('${a}'),('${b}'),('${c}');`);

    // A arma el grupo sin compartir su historial; B se suma y carga datos.
    await as(a);
    await db.exec(
      `insert into movements(date,name,amount,currency,kind,category_id) select '2026-09-01','Personal de A',10,'ARS','expense',id from categories limit 1;`,
    );
    const family = (
      await db.query<{ id: string }>(
        `select public.create_family('Familia','Ana',false) as id`,
      )
    ).rows[0].id;
    const invite = async () =>
      (
        await db.query<{ token: string }>(
          "select public.create_family_invite() as token",
        )
      ).rows[0].token;
    const token = await invite();
    await as(b);
    await db.exec(`select public.join_family('${token}','Beto')`);
    const shared = (
      await db.query<{ id: string }>(
        `select id from categories where family_id='${family}' limit 1`,
      )
    ).rows[0].id;
    await db.exec(
      `insert into movements(family_id,date,name,amount,currency,kind,category_id) values('${family}','2026-09-02','Gasto de B',5,'ARS','expense','${shared}');
       insert into budgets(family_id,month,category_id,currency,amount) values('${family}','2026-09-01','${shared}','ARS',100);
       insert into categories(family_id,name,color,kind) values('${family}','Creada por B','#112233','expense');`,
    );

    // Solo el administrador transfiere, y solo a un integrante.
    await assert.rejects(() =>
      db.exec(`select public.transfer_family_ownership('${b}')`),
    );
    await assert.rejects(() => db.exec(`select public.delete_family()`));
    await as(a);
    await assert.rejects(() =>
      db.exec(`select public.transfer_family_ownership('${c}')`),
    );
    await assert.rejects(() =>
      db.exec(`select public.transfer_family_ownership('${a}')`),
    );
    // Un administrador con integrantes no puede borrar su cuenta sin resolver el grupo.
    await assert.rejects(() => db.exec(`select public.delete_account()`));
    const stale = await invite();
    await db.exec(`select public.transfer_family_ownership('${b}')`);
    assert.equal(
      (await db.query<{ owner_id: string }>("select owner_id from families"))
        .rows[0].owner_id,
      b,
    );
    await assert.rejects(() => db.exec(`select public.create_family_invite()`));
    await as(c);
    await assert.rejects(
      () => db.exec(`select public.join_family('${stale}','Cami')`),
      "transferir revoca invitaciones pendientes",
    );

    // A, ya integrante común, carga un gasto y borra su cuenta: el grupo conserva todo.
    await as(a);
    await db.exec(
      `insert into movements(family_id,date,name,amount,currency,kind,category_id) values('${family}','2026-09-03','Gasto de A',7,'ARS','expense','${shared}');`,
    );
    await db.exec(`select public.delete_account()`);
    await db.exec("reset role");
    assert.equal(await count(`select 1 from auth.users where id='${a}'`), 0);
    assert.equal(
      await count(`select 1 from public.movements where family_id is null`),
      0,
      "los datos personales se borran con la cuenta",
    );
    assert.equal(
      await count(`select 1 from public.categories where user_id='${a}'`),
      0,
    );
    await as(b);
    assert.equal(await count("select 1 from movements"), 2);
    assert.equal(
      (
        await db.query<{ user_id: string }>(
          "select user_id from movements where name='Gasto de A'",
        )
      ).rows[0].user_id,
      b,
      "el historial compartido queda a nombre del administrador",
    );
    assert.equal(await count("select 1 from family_members"), 1);
    assert.equal(
      await count(`select 1 from categories where family_id='${family}'`),
      8,
    );

    // B elimina el grupo: desaparecen los datos compartidos, no los personales.
    const personal = await count(
      "select 1 from categories where family_id is null",
    );
    await db.exec(`select public.delete_family()`);
    assert.equal(await count("select 1 from families"), 0);
    assert.equal(await count("select 1 from movements"), 0);
    assert.equal(await count("select 1 from budgets"), 0);
    assert.equal(await count("select 1 from categories"), personal);
    assert.equal(personal, 7);

    // B, administrador de un grupo sin otros integrantes, puede borrar su cuenta.
    await db.exec(`select public.create_family('Sola','Beto',true)`);
    await db.exec(`select public.delete_account()`);
    await db.exec("reset role");
    assert.equal(await count("select 1 from auth.users"), 1);
    assert.equal(await count("select 1 from public.families"), 0);
    assert.equal(await count("select 1 from public.categories"), 7);

    // Sin sesión no hay nada que borrar.
    await db.exec(`set role authenticated;set request.jwt.claim.sub='';`);
    await assert.rejects(() => db.exec(`select public.delete_account()`));
  } finally {
    await db.close();
  }
});
