import { supabase } from "@/lib/supabase";
import type { Interpreted, InterpretRequest } from "./schema";

// Manda la frase al servidor, que es el único que conoce la clave de la IA.
// Viajan la frase y los nombres de categorías y medios de pago; nunca movimientos ni saldos.
export async function interpretPhrase(
  request: InterpretRequest,
): Promise<Interpreted> {
  const session = (await supabase!.auth.getSession()).data.session;
  if (!session) throw new Error("Iniciá sesión.");
  let response: Response;
  try {
    response = await fetch("/api/interpretar", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(request),
    });
  } catch {
    throw new Error("Sin conexión: cargalo a mano.");
  }
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(body?.error || "No se pudo interpretar la frase.");
  return body as Interpreted;
}
