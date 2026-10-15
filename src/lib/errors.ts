export function errorText(e: unknown) {
  const x = e as { message?: string; code?: string };
  if (x.code === "23503")
    return "Esta categoría tiene movimientos o presupuestos. Desactivala para conservar su historial.";
  if (x.code === "23505") return "Ya existe un registro con esos datos.";
  // PostgREST no encuentra la función: falta aplicar una migración.
  if (x.code === "PGRST202")
    return "Esta función necesita la migración 202610090004_family_management.sql. Ejecutala en el SQL Editor de Supabase y volvé a intentar.";
  return x.message || "No se pudo completar la operación. Intentá nuevamente.";
}
