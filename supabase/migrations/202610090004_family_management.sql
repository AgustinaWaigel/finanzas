-- Aplicar DESPUÉS de 202609280002_families.sql. Conserva los datos existentes.
-- Agrega: transferir la administración, eliminar el grupo, eliminar la cuenta
-- y avisos en tiempo real entre integrantes.
begin;

create function public.transfer_family_ownership(member_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare fid uuid;
begin
 select id into fid from public.families where owner_id=auth.uid() for update;
 if fid is null then raise exception 'Solo el administrador puede transferir el grupo'; end if;
 if member_id=auth.uid() then raise exception 'Ya sos el administrador'; end if;
 if not exists(select 1 from public.family_members where user_id=member_id and family_id=fid) then raise exception 'Esa persona no integra el grupo'; end if;
 update public.families set owner_id=member_id where id=fid;
 -- Las invitaciones pendientes las había generado el administrador anterior.
 delete from private.family_invites where family_id=fid;
end $$;

-- Borra el grupo con todos sus datos compartidos. Los archivos de tickets quedan
-- privados en Storage y vuelven a depender solo de quien los subió.
create function private.purge_family(fid uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 delete from public.budgets where family_id=fid;
 delete from public.movements where family_id=fid;
 delete from public.categories where family_id=fid;
 delete from private.receipt_scopes where family_id=fid;
 delete from public.families where id=fid;
end $$;
revoke all on function private.purge_family(uuid) from public,anon,authenticated;

create function public.delete_family() returns void
language plpgsql security definer set search_path='' as $$
declare fid uuid;
begin
 select id into fid from public.families where owner_id=auth.uid() for update;
 if fid is null then raise exception 'Solo el administrador puede eliminar el grupo'; end if;
 perform private.purge_family(fid);
end $$;

create function public.delete_account() returns void
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
 update public.movements m set user_id=f.owner_id from public.families f where m.family_id=f.id and m.user_id=uid;
 update public.budgets b set user_id=f.owner_id from public.families f where b.family_id=f.id and b.user_id=uid;
 update private.receipt_scopes s set user_id=f.owner_id from public.families f where s.family_id=f.id and s.user_id=uid;
 delete from public.family_members where user_id=uid;
 -- El orden evita que la restricción de categorías en uso frene el borrado en cascada.
 delete from public.budgets where user_id=uid;
 delete from public.movements where user_id=uid;
 delete from public.categories where user_id=uid;
 delete from private.receipt_scopes where user_id=uid;
 delete from auth.users where id=uid;
end $$;

revoke all on function public.transfer_family_ownership(uuid),public.delete_family(),public.delete_account() from public,anon;
grant execute on function public.transfer_family_ownership(uuid),public.delete_family(),public.delete_account() to authenticated;

-- Tiempo real: cada integrante recibe los cambios que RLS le permite leer.
do $$ declare t text; begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  foreach t in array array['movements','categories','budgets','family_members'] loop
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
    execute format('alter publication supabase_realtime add table public.%I',t);
   end if;
  end loop;
 end if;
end $$;

notify pgrst, 'reload schema';
commit;
