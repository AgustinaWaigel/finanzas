-- Aplicar DESPUÉS de 202610090004_family_management.sql. Conserva los datos existentes.
-- Medios de pago cargados a mano (efectivo, billeteras, tarjetas). No se conecta con ningún banco ni billetera.
begin;

create table public.payment_methods(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users on delete cascade default auth.uid(),
 family_id uuid references public.families on delete restrict,
 name text not null check(length(trim(name)) between 1 and 60),
 kind text not null check(kind in ('cash','wallet','debit','credit','transfer')),
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create unique index payment_methods_personal_name on public.payment_methods(user_id,lower(name)) where family_id is null;
create unique index payment_methods_family_name on public.payment_methods(family_id,lower(name)) where family_id is not null;
create index on public.payment_methods(family_id);

-- Borrar un medio de pago no borra sus movimientos: quedan sin medio asignado.
alter table public.movements add column payment_method_id uuid references public.payment_methods on delete set null;
create index on public.movements(payment_method_id);

alter table public.payment_methods enable row level security;
revoke all on public.payment_methods from public,anon,authenticated;
grant select,insert,delete on public.payment_methods to authenticated;
grant update(name,kind,active) on public.payment_methods to authenticated;
grant update(payment_method_id) on public.movements to authenticated;
create policy scope_read on public.payment_methods for select to authenticated using ((family_id is null and user_id=(select auth.uid())) or private.is_family_member(family_id));
create policy scope_insert on public.payment_methods for insert to authenticated with check (user_id=(select auth.uid()) and (family_id is null or private.is_family_member(family_id)));
create policy scope_update on public.payment_methods for update to authenticated using ((family_id is null and user_id=(select auth.uid())) or private.is_family_member(family_id)) with check ((family_id is null and user_id=(select auth.uid())) or private.is_family_member(family_id));
create policy scope_delete on public.payment_methods for delete to authenticated using ((family_id is null and user_id=(select auth.uid())) or private.is_family_member(family_id));

create function public.validate_payment_method() returns trigger language plpgsql set search_path='' as $$
declare m public.payment_methods; changed boolean;
begin
 if new.payment_method_id is null then return new; end if;
 select * into m from public.payment_methods where id=new.payment_method_id;
 if not found or m.family_id is distinct from new.family_id or (new.family_id is null and m.user_id<>new.user_id) then raise exception 'El medio de pago no pertenece a este espacio'; end if;
 changed := TG_OP='INSERT';
 if TG_OP='UPDATE' then changed := new.payment_method_id is distinct from old.payment_method_id; end if;
 if not m.active and changed then raise exception 'El medio de pago está desactivado'; end if;
 return new;
end $$;
create trigger validate_movement_payment before insert or update on public.movements for each row execute function public.validate_payment_method();

-- Al crear un grupo, los medios de pago acompañan a los movimientos (o se copian si no se comparte el historial).
create or replace function public.create_family(family_name text, member_name text, share_existing boolean default true) returns uuid
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
  update public.payment_methods set family_id=fid where user_id=uid and family_id is null;
  update public.movements set family_id=fid where user_id=uid and family_id is null;
  update public.budgets set family_id=fid where user_id=uid and family_id is null;
 else
  insert into public.categories(user_id,family_id,name,color,kind,active) select uid,fid,name,color,kind,active from public.categories where user_id=uid and family_id is null;
  insert into public.payment_methods(user_id,family_id,name,kind,active) select uid,fid,name,kind,active from public.payment_methods where user_id=uid and family_id is null;
 end if;
 return fid;
end $$;

create or replace function private.purge_family(fid uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 delete from public.budgets where family_id=fid;
 delete from public.movements where family_id=fid;
 delete from public.categories where family_id=fid;
 delete from public.payment_methods where family_id=fid;
 delete from private.receipt_scopes where family_id=fid;
 delete from public.families where id=fid;
end $$;

create or replace function public.delete_account() returns void
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); fid uuid;
begin
 if uid is null then raise exception 'Iniciá sesión'; end if;
 select id into fid from public.families where owner_id=uid for update;
 if fid is not null then
  if exists(select 1 from public.family_members where family_id=fid and user_id<>uid) then
   raise exception 'Transferí la administración o eliminá el grupo antes de borrar tu cuenta';
  end if;
  perform private.purge_family(fid);
 end if;
 -- Lo que cargó en un grupo (actual o anterior) queda en ese grupo, a nombre de su administrador.
 update public.categories c set user_id=f.owner_id from public.families f where c.family_id=f.id and c.user_id=uid;
 update public.payment_methods p set user_id=f.owner_id from public.families f where p.family_id=f.id and p.user_id=uid;
 update public.movements m set user_id=f.owner_id from public.families f where m.family_id=f.id and m.user_id=uid;
 update public.budgets b set user_id=f.owner_id from public.families f where b.family_id=f.id and b.user_id=uid;
 update private.receipt_scopes s set user_id=f.owner_id from public.families f where s.family_id=f.id and s.user_id=uid;
 delete from public.family_members where user_id=uid;
 -- El orden evita que la restricción de categorías en uso frene el borrado en cascada.
 delete from public.budgets where user_id=uid;
 delete from public.movements where user_id=uid;
 delete from public.categories where user_id=uid;
 delete from public.payment_methods where user_id=uid;
 delete from private.receipt_scopes where user_id=uid;
 delete from auth.users where id=uid;
end $$;

do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime')
  and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='payment_methods') then
  alter publication supabase_realtime add table public.payment_methods;
 end if;
end $$;

notify pgrst, 'reload schema';
commit;
