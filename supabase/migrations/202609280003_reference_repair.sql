-- Reparación para instalaciones que aplicaron familias antes del campo Referencia.
-- No elimina ni reemplaza movimientos. Puede ejecutarse más de una vez.
begin;
alter table public.movements
  add column if not exists reference text not null default ''
  check (length(reference) <= 200);
grant update(reference) on public.movements to authenticated;
notify pgrst, 'reload schema';
commit;
