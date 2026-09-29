begin;
create table public.currencies(code text primary key check(code ~ '^[A-Z]{3}$'), symbol text not null, decimals integer not null check(decimals between 0 and 4));
insert into public.currencies values ('ARS','$',2),('USD','US$',2);
create table public.categories(
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade default auth.uid(),
 name text not null check(length(trim(name)) between 1 and 60),color text not null check(color ~ '^#[0-9a-fA-F]{6}$'),
 kind text not null check(kind in ('expense','income')),active boolean not null default true,
 unique(id,user_id),unique(user_id,name,kind)
);
create table public.movements(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users on delete cascade default auth.uid(),
 date date not null, name text not null check(length(trim(name)) between 1 and 120),
 amount numeric not null check(amount>0 and amount<100000000000000), amount_text text generated always as (amount::text) stored,
 currency text not null references public.currencies,kind text not null check(kind in ('expense','income')),
 category_id uuid, note text not null default '' check(length(note)<=2000),receipt_path text,
 created_at timestamptz not null default now(),
 foreign key(category_id,user_id) references public.categories(id,user_id) on delete restrict,
 check(kind <> 'expense' or category_id is not null),check(receipt_path is null or (kind='expense' and split_part(receipt_path,'/',1)=user_id::text))
);
create table public.budgets(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users on delete cascade default auth.uid(),
 month date not null check(extract(day from month)=1),category_id uuid not null,
 currency text not null references public.currencies,amount numeric not null check(amount>0 and amount<100000000000000),
 amount_text text generated always as (amount::text) stored,
 foreign key(category_id,user_id) references public.categories(id,user_id) on delete restrict,
 unique(user_id,month,category_id,currency)
);
create index on public.movements(user_id,date);
create index on public.movements(category_id);
create index on public.budgets(category_id);
create function public.validate_finance_row() returns trigger language plpgsql set search_path='' as $$
declare c public.categories; places integer; changed boolean;
begin
 select decimals into places from public.currencies where code=new.currency;
 if scale(new.amount)>places then raise exception 'El importe tiene demasiados decimales'; end if;
 if new.category_id is not null then
  select * into c from public.categories where id=new.category_id and user_id=new.user_id;
  if not found then raise exception 'Categoría inválida'; end if;
  changed := TG_OP='INSERT';
  if TG_OP='UPDATE' then changed := new.category_id is distinct from old.category_id; end if;
  if not c.active and changed then raise exception 'La categoría está desactivada'; end if;
  if TG_TABLE_NAME='budgets' then
   if c.kind<>'expense' then raise exception 'El presupuesto requiere una categoría de gasto'; end if;
  elsif c.kind<>new.kind then raise exception 'El tipo de categoría no coincide'; end if;
 end if;
 return new;
end $$;
create trigger validate_movement before insert or update on public.movements for each row execute function public.validate_finance_row();
create trigger validate_budget before insert or update on public.budgets for each row execute function public.validate_finance_row();
create function public.protect_category_kind() returns trigger language plpgsql set search_path='' as $$
begin
 if new.kind<>old.kind and (exists(select 1 from public.movements where category_id=old.id) or exists(select 1 from public.budgets where category_id=old.id)) then raise exception 'La categoría tiene historial: no se puede cambiar el tipo'; end if;
 return new;
end $$;
create trigger protect_category before update on public.categories for each row execute function public.protect_category_kind();
alter table public.currencies enable row level security;
alter table public.categories enable row level security;
alter table public.movements enable row level security;
alter table public.budgets enable row level security;
create policy currencies_read on public.currencies for select to authenticated using(true);
create policy categories_owner on public.categories for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy movements_owner on public.movements for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy budgets_owner on public.budgets for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
revoke all on public.currencies,public.categories,public.movements,public.budgets from anon;
grant select on public.currencies to authenticated;
grant select,insert,update,delete on public.categories,public.movements,public.budgets to authenticated;
create function public.seed_categories() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.categories(user_id,name,color,kind)
 select new.id,n,'#'||c,'expense' from unnest(
 array['Otros','Supermercado','Servicios','Gastos fijos','Salud y seguros','Transporte','Mascotas'],
 array['7c8798','176b51','e8a139','64748b','da7272','8b77bb','bf975b']) as t(n,c);
 return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.seed_categories();
revoke execute on function public.seed_categories() from public,anon,authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('receipts','receipts',false,5242880,array['image/jpeg','image/png','image/webp']);
create policy receipts_read on storage.objects for select to authenticated using(bucket_id='receipts' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy receipts_insert on storage.objects for insert to authenticated with check(bucket_id='receipts' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy receipts_delete on storage.objects for delete to authenticated using(bucket_id='receipts' and (storage.foldername(name))[1]=(select auth.uid())::text);
commit;
