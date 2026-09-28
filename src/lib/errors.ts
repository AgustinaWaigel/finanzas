export function errorText(e: unknown) {
  const x = e as { message?: string; code?: string };
  if (x.code === "23503")
    return "Esta categoría tiene movimientos o presupuestos. Desactivala para conservar su historial.";
  if (x.code === "23505") return "Ya existe un registro con esos datos.";
  return x.message || "No se pudo completar la operación. Intentá nuevamente.";
}
