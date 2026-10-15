-- Aplicar DESPUÉS de 202610090005_payment_methods.sql. Conserva los datos existentes.
-- Agrega: cierre y vencimiento de tarjetas, saldo por cuenta y transferencias entre medios de pago.
-- Todo se carga a mano; no hay conexión con bancos ni billeteras.
begin;

alter table public.payment_methods
 add column closing_day integer check(closing_day between 1 and 31),
 add column due_day integer check(due_day between 1 and 31),
 add column currency text references public.currencies,
 add column opening_balance numeric check(abs(opening_balance)<100000000000000),
 add column opening_balance_text text generated always as (opening_balance::text) stored,
 add column balance_date date,
 -- Una tarjeta de crédito es deuda: tiene cierre y vencimiento, no saldo.
 add constraint credit_has_no_balance check(kind<>'credit' or (currency is null and opening_balance is null)),
 add constraint only_credit_closes check(kind='credit' or (closing_day is null and due_day is null)),
 add constraint balance_is_complete check((opening_balance is null)=(balance_date is null) and (opening_balance is null or currency is not null));
grant update(closing_day,due_day,currency,opening_balance,balance_date) on public.payment_methods to authenticated;

-- Pasar plata de una cuenta a otra, o pagar el resumen de una tarjeta. No es gasto ni ingreso.
create table public.transfers(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users on delete cascade default auth.uid(),
 family_id uuid references public.families on delete restrict,
 date date not null,
 from_method_id uuid not null references public.payment_methods on delete cascade,
 to_method_id uuid not null references public.payment_methods on delete cascade,
 amount numeric not null check(amount>0 and amount<100000000000000),
 amount_text text generated always as (amount::text) stored,
 note text not null default '' check(length(note)<=200),
 created_at timestamptz not null default now(),
 check(from_method_id<>to_method_id)
);
create index on public.transfers(family_id,date);
create index on public.transfers(user_id,date);
create index on public.transfers(from_method_id);
create index on public.transfers(to_method_id);

alter table public.transfers enable row level security;
revoke all on public.transfers from public,anon,authenticated;
grant select,insert,delete on public.transfers to authenticated;
create policy scope_read on public.transfers for select to authenticated using ((family_id is null and user_id=(select auth.uid())) or private.is_family_member(family_id));
create policy scope_insert on public.transfers for insert to authenticated with check (user_id=(select auth.uid()) and (family_id is null or private.is_family_member(family_id)));
create policy scope_delete on public.transfers for delete to authenticated using ((family_id is null and user_id=(select auth.uid())) or private.is_family_member(family_id));

create function public.validate_transfer() returns trigger language plpgsql set search_path='' as $$
declare a public.payment_methods; b public.payment_methods; places integer;
begin
 select * into a from public.payment_methods where id=new.from_method_id;
 select * into b from public.payment_methods where id=new.to_method_id;
 if a.id is null or b.id is null
  or a.family_id is distinct from new.family_id or b.family_id is distinct from new.family_id
  or (new.family_id is null and (a.user_id<>new.user_id or b.user_id<>new.user_id)) then
  raise exception 'El medio de pago no pertenece a este espacio';
 end if;
 if a.kind='credit' or a.currency is null then raise exception 'El origen tiene que ser una cuenta con moneda'; end if;
 if b.kind<>'credit' and b.currency is distinct from a.currency then raise exception 'Las dos cuentas tienen que ser de la misma moneda'; end if;
 select decimals into places from public.currencies where code=a.currency;
 if scale(new.amount)>places then raise exception 'El importe tiene demasiados decimales'; end if;
 return new;
end $$;
create trigger validate_transfer before insert or update on public.transfers for each row execute function public.validate_transfer();

-- Saldo de cada cuenta que lo lleva: saldo inicial más lo ocurrido desde su fecha hasta hoy.
-- Corre con los permisos de quien consulta, así que RLS limita lo que ve.
create function public.payment_balances(space uuid, today date) returns table(method_id uuid, balance text)
language sql stable set search_path='' as $$
 select p.id,
  (p.opening_balance
   + coalesce((select sum(case when m.kind='income' then m.amount else -m.amount end) from public.movements m
      where m.payment_method_id=p.id and m.currency=p.currency and m.date>=p.balance_date and m.date<=today),0)
   + coalesce((select sum(t.amount) from public.transfers t where t.to_method_id=p.id and t.date>=p.balance_date and t.date<=today),0)
   - coalesce((select sum(t.amount) from public.transfers t where t.from_method_id=p.id and t.date>=p.balance_date and t.date<=today),0))::text
 from public.payment_methods p
 where p.opening_balance is not null and p.family_id is not distinct from space;
$$;
revoke all on function public.payment_balances(uuid,date) from public,anon;
grant execute on function public.payment_balances(uuid,date) to authenticated;

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
  update public.transfers set family_id=fid where user_id=uid and family_id is null;
  update public.movements set family_id=fid where user_id=uid and family_id is null;
  update public.budgets set family_id=fid where user_id=uid and family_id is null;
 else
  insert into public.categories(user_id,family_id,name,color,kind,active) select uid,fid,name,color,kind,active from public.categories where user_id=uid and family_id is null;
  -- Se copian las etiquetas, no los saldos: la plata sigue en el espacio personal.
  insert into public.payment_methods(user_id,family_id,name,kind,active,closing_day,due_day) select uid,fid,name,kind,active,closing_day,due_day from public.payment_methods where user_id=uid and family_id is null;
 end if;
 return fid;
end $$;

create or replace function private.purge_family(fid uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 delete from public.budgets where family_id=fid;
 delete from public.transfers where family_id=fid;
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
 update public.transfers t set user_id=f.owner_id from public.families f where t.family_id=f.id and t.user_id=uid;
 update public.movements m set user_id=f.owner_id from public.families f where m.family_id=f.id and m.user_id=uid;
 update public.budgets b set user_id=f.owner_id from public.families f where b.family_id=f.id and b.user_id=uid;
 update private.receipt_scopes s set user_id=f.owner_id from public.families f where s.family_id=f.id and s.user_id=uid;
 delete from public.family_members where user_id=uid;
 -- El orden evita que la restricción de categorías en uso frene el borrado en cascada.
 delete from public.budgets where user_id=uid;
 delete from public.transfers where user_id=uid;
 delete from public.movements where user_id=uid;
 delete from public.categories where user_id=uid;
 delete from public.payment_methods where user_id=uid;
 delete from private.receipt_scopes where user_id=uid;
 delete from auth.users where id=uid;
end $$;

do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime')
  and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='transfers') then
  alter publication supabase_realtime add table public.transfers;
 end if;
end $$;

notify pgrst, 'reload schema';
commit;
