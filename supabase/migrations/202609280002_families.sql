-- Aplicar DESPUÉS de 202609280001_initial.sql. Conserva los datos existentes.
begin;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.families (
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(trim(name)) between 1 and 60),
 owner_id uuid not null references auth.users on delete restrict,
 created_at timestamptz not null default now()
);
create table public.family_members (
 user_id uuid primary key references auth.users on delete cascade,
 family_id uuid not null references public.families on delete cascade,
 display_name text not null check(length(trim(display_name)) between 1 and 60),
 joined_at timestamptz not null default now()
);
create index on public.family_members(family_id);
create table private.family_invites (
 token uuid primary key default gen_random_uuid(),
 family_id uuid not null references public.families on delete cascade,
 expires_at timestamptz not null default now()+interval '7 days',
 used_at timestamptz
);
create table private.receipt_scopes (
 path text primary key, user_id uuid not null,
 family_id uuid references public.families on delete restrict
);
revoke all on private.family_invites,private.receipt_scopes from public,anon,authenticated;

create function private.is_family_member(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.family_members where family_id=target and user_id=(select auth.uid()));
$$;
revoke all on function private.is_family_member(uuid) from public,anon;
grant execute on function private.is_family_member(uuid) to authenticated;

alter table public.families enable row level security;
alter table public.family_members enable row level security;
revoke all on public.families,public.family_members from public,anon,authenticated;
grant select on public.families,public.family_members to authenticated;
create policy family_read on public.families for select to authenticated using(private.is_family_member(id));
create policy members_read on public.family_members for select to authenticated using(private.is_family_member(family_id));

alter table public.categories add column family_id uuid references public.families on delete restrict;
alter table public.movements add column family_id uuid references public.families on delete restrict;
alter table public.budgets add column family_id uuid references public.families on delete restrict;
alter table public.movements drop constraint movements_category_id_user_id_fkey;
alter table public.budgets drop constraint budgets_category_id_user_id_fkey;
alter table public.movements add foreign key(category_id) references public.categories(id) on delete restrict;
alter table public.budgets add foreign key(category_id) references public.categories(id) on delete restrict;
alter table public.categories drop constraint categories_user_id_name_kind_key;
alter table public.budgets drop constraint budgets_user_id_month_category_id_currency_key;
create unique index categories_personal_name on public.categories(user_id,name,kind) where family_id is null;
create unique index categories_family_name on public.categories(family_id,name,kind) where family_id is not null;
-- PostgreSQL 15+: NULLS NOT DISTINCT impide duplicar presupuestos personales.
create unique index budgets_scope_unique on public.budgets(family_id,user_id,month,category_id,currency) nulls not distinct;
create unique index budgets_family_unique on public.budgets(family_id,month,category_id,currency) where family_id is not null;
create index on public.movements(family_id,date);
create index on public.categories(family_id);
create index on public.budgets(family_id);

-- No se permite cambiar autor o espacio mediante la API de edición.
revoke update on public.categories,public.movements,public.budgets from authenticated;
grant update(name,color,kind,active) on public.categories to authenticated;
grant update(date,name,amount,currency,kind,category_id,note,receipt_path) on public.movements to authenticated;
grant update(month,category_id,currency,amount) on public.budgets to authenticated;

drop policy categories_owner on public.categories;
drop policy movements_owner on public.movements;
drop policy budgets_owner on public.budgets;
do $$ declare t text; begin
 foreach t in array array['categories','movements','budgets'] loop
  execute format('create policy scope_read on public.%I for select to authenticated using ((family_id is null and user_id=(select auth.uid())) or private.is_family_member(family_id))',t);
  execute format('create policy scope_insert on public.%I for insert to authenticated with check (user_id=(select auth.uid()) and (family_id is null or private.is_family_member(family_id)))',t);
  execute format('create policy scope_update on public.%I for update to authenticated using ((family_id is null and user_id=(select auth.uid())) or private.is_family_member(family_id)) with check ((family_id is null and user_id=(select auth.uid())) or private.is_family_member(family_id))',t);
  execute format('create policy scope_delete on public.%I for delete to authenticated using ((family_id is null and user_id=(select auth.uid())) or private.is_family_member(family_id))',t);
 end loop;
end $$;

create or replace function public.validate_finance_row() returns trigger language plpgsql set search_path='' as $$
declare c public.categories; places integer; changed boolean;
begin
 select decimals into places from public.currencies where code=new.currency;
 if scale(new.amount)>places then raise exception 'El importe tiene demasiados decimales'; end if;
 if new.category_id is not null then
  select * into c from public.categories where id=new.category_id;
  if not found or c.family_id is distinct from new.family_id or (new.family_id is null and c.user_id<>new.user_id) then raise exception 'La categoría no pertenece a este espacio'; end if;
  changed := TG_OP='INSERT';
  if TG_OP='UPDATE' then changed := new.category_id is distinct from old.category_id; end if;
  if not c.active and changed then raise exception 'La categoría está desactivada'; end if;
  if TG_TABLE_NAME='budgets' then
   if c.kind<>'expense' then raise exception 'El presupuesto requiere una categoría de gasto'; end if;
  elsif c.kind<>new.kind then raise exception 'El tipo de categoría no coincide'; end if;
 end if;
 return new;
end $$;

-- El ticket puede haber sido subido por cualquier integrante, no solo el autor original.
do $$ declare constraint_name text; begin
 for constraint_name in select conname from pg_constraint where conrelid='public.movements'::regclass and contype='c' and pg_get_constraintdef(oid) like '%receipt_path%' loop
  execute format('alter table public.movements drop constraint %I',constraint_name);
 end loop;
end $$;
alter table public.movements add constraint receipts_only_expenses check(receipt_path is null or kind='expense');
insert into private.receipt_scopes(path,user_id,family_id)
 select distinct receipt_path,user_id,family_id from public.movements where receipt_path is not null;

create function private.track_receipt_scope() returns trigger language plpgsql security definer set search_path='' as $$
declare previous private.receipt_scopes; changed boolean;
begin
 if new.receipt_path is null then return new; end if;
 changed := TG_OP='INSERT';
 if TG_OP='UPDATE' then changed := new.receipt_path is distinct from old.receipt_path; end if;
 if changed and split_part(new.receipt_path,'/',1) is distinct from auth.uid()::text then raise exception 'El ticket debe ser una subida propia'; end if;
 select * into previous from private.receipt_scopes where path=new.receipt_path for update;
 if found and changed and (previous.family_id is distinct from new.family_id or (new.family_id is null and previous.user_id<>new.user_id)) then raise exception 'El ticket pertenece a otro espacio'; end if;
 insert into private.receipt_scopes(path,user_id,family_id) values(new.receipt_path,new.user_id,new.family_id)
 on conflict(path) do update set family_id=excluded.family_id;
 return new;
end $$;
create trigger track_receipts before insert or update on public.movements for each row execute function private.track_receipt_scope();
revoke all on function private.track_receipt_scope() from public,anon,authenticated;

create function private.can_access_receipt(target text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare scope private.receipt_scopes;
begin
 select * into scope from private.receipt_scopes where path=target;
 if found then
  if scope.family_id is not null then return private.is_family_member(scope.family_id); end if;
  return scope.user_id=auth.uid();
 end if;
 return split_part(target,'/',1)=auth.uid()::text;
end $$;
revoke all on function private.can_access_receipt(text) from public,anon;
grant execute on function private.can_access_receipt(text) to authenticated;
drop policy receipts_read on storage.objects;
drop policy receipts_delete on storage.objects;
create policy receipts_read on storage.objects for select to authenticated using(bucket_id='receipts' and private.can_access_receipt(name));
create policy receipts_delete on storage.objects for delete to authenticated using(bucket_id='receipts' and private.can_access_receipt(name));
-- Mantener scope en el registro privado permite borrar tickets tras eliminar el movimiento.

create function public.create_family(family_name text, member_name text, share_existing boolean default true) returns uuid
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); fid uuid;
begin
 if uid is null then raise exception 'Iniciá sesión'; end if;
 perform 1 from auth.users where id=uid for update;
 if exists(select 1 from public.family_members where user_id=uid) then raise exception 'Ya pertenecés a un grupo'; end if;
 insert into public.families(name,owner_id) values(trim(family_name),uid) returning id into fid;
 insert into public.family_members(user_id,family_id,display_name) values(uid,fid,trim(member_name));
 if share_existing then
  update public.categories set family_id=fid where user_id=uid and family_id is null;
  update public.movements set family_id=fid where user_id=uid and family_id is null;
  update public.budgets set family_id=fid where user_id=uid and family_id is null;
 else
  insert into public.categories(user_id,family_id,name,color,kind,active) select uid,fid,name,color,kind,active from public.categories where user_id=uid and family_id is null;
 end if;
 return fid;
end $$;

create function public.create_family_invite() returns uuid language plpgsql security definer set search_path='' as $$
declare fid uuid; code uuid;
begin
 select f.id into fid from public.families f join public.family_members m on m.family_id=f.id where m.user_id=auth.uid() and f.owner_id=auth.uid();
 if fid is null then raise exception 'Solo el administrador puede invitar'; end if;
 -- Generar otro código revoca cualquier invitación pendiente anterior.
 delete from private.family_invites where family_id=fid;
 insert into private.family_invites(family_id) values(fid) returning token into code;
 return code;
end $$;
create function public.join_family(invite_code uuid, member_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare invitation private.family_invites; uid uuid:=auth.uid();
begin
 if uid is null then raise exception 'Iniciá sesión'; end if;
 perform 1 from auth.users where id=uid for update;
 if exists(select 1 from public.family_members where user_id=uid) then raise exception 'Ya pertenecés a un grupo'; end if;
 select * into invitation from private.family_invites where token=invite_code and used_at is null and expires_at>now() for update;
 if not found then raise exception 'La invitación no existe, venció o ya fue utilizada'; end if;
 insert into public.family_members(user_id,family_id,display_name) values(uid,invitation.family_id,trim(member_name));
 update private.family_invites set used_at=now() where token=invite_code;
 return invitation.family_id;
end $$;
create function public.remove_family_member(member_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare fid uuid; owner uuid;
begin
 select family_id into fid from public.family_members where user_id=auth.uid();
 select owner_id into owner from public.families where id=fid;
 if fid is null or (auth.uid()<>owner and member_id<>auth.uid()) then raise exception 'No tenés permiso'; end if;
 if member_id=owner then raise exception 'El administrador debe permanecer en el grupo'; end if;
 delete from public.family_members where user_id=member_id and family_id=fid;
 -- Una expulsión también invalida invitaciones pendientes para evitar reingresos con códigos viejos.
 delete from private.family_invites where family_id=fid;
end $$;
revoke all on function public.create_family(text,text,boolean),public.create_family_invite(),public.join_family(uuid,text),public.remove_family_member(uuid) from public,anon;
grant execute on function public.create_family(text,text,boolean),public.create_family_invite(),public.join_family(uuid,text),public.remove_family_member(uuid) to authenticated;
commit;
