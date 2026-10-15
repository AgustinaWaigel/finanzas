-- Aplicar DESPUÉS de las anteriores. Conserva los datos existentes.
-- Dispositivos que aceptaron recibir el recordatorio diario para cargar gastos.
begin;

create table public.push_subscriptions(
 endpoint text primary key check(length(endpoint) between 10 and 2000),
 user_id uuid not null references auth.users on delete cascade default auth.uid(),
 p256dh text not null check(length(p256dh) between 10 and 300),
 auth text not null check(length(auth) between 10 and 100),
 created_at timestamptz not null default now()
);
create index on public.push_subscriptions(user_id);

-- Cada persona ve y administra solo sus dispositivos. El envío lo hace el servidor
-- con la clave de servicio, que no pasa por estas políticas.
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from public,anon,authenticated;
grant select,insert,delete on public.push_subscriptions to authenticated;
-- El alta es un "upsert": si el dispositivo ya estaba, se actualizan sus claves.
grant update(endpoint,p256dh,auth) on public.push_subscriptions to authenticated;
create policy own_read on public.push_subscriptions for select to authenticated using (user_id=(select auth.uid()));
create policy own_insert on public.push_subscriptions for insert to authenticated with check (user_id=(select auth.uid()));
create policy own_update on public.push_subscriptions for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy own_delete on public.push_subscriptions for delete to authenticated using (user_id=(select auth.uid()));

notify pgrst, 'reload schema';
commit;
