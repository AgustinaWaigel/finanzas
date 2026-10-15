import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

// Recordatorio diario de las 21 (hora de Argentina). Lo dispara un programador externo
// (vercel.json lo agenda a las 00:00 UTC) con el secreto CRON_SECRET en el encabezado Authorization.
export const dynamic = "force-dynamic";

type Subscription = {
  endpoint: string;
  user_id: string;
  p256dh: string;
  auth: string;
};

export async function GET(request: Request) {
  const {
    CRON_SECRET,
    SUPABASE_SERVICE_ROLE_KEY,
    VAPID_PRIVATE_KEY,
    VAPID_SUBJECT,
    NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    NEXT_PUBLIC_SUPABASE_URL,
  } = process.env;
  if (
    !CRON_SECRET ||
    !SUPABASE_SERVICE_ROLE_KEY ||
    !VAPID_PRIVATE_KEY ||
    !NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
    !NEXT_PUBLIC_SUPABASE_URL
  )
    return Response.json(
      { error: "Recordatorios sin configurar en el servidor." },
      { status: 503 },
    );
  if (request.headers.get("authorization") !== `Bearer ${CRON_SECRET}`)
    return Response.json({ error: "No autorizado." }, { status: 401 });

  webpush.setVapidDetails(
    VAPID_SUBJECT || "mailto:admin@example.com",
    NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY,
  );
  // Clave de servicio: solo existe en el servidor y solo se usa acá.
  const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: subscriptions, error } = await admin
    .from("push_subscriptions")
    .select("endpoint,user_id,p256dh,auth")
    .limit(5000);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const list = (subscriptions ?? []) as Subscription[];
  if (!list.length) return Response.json({ sent: 0, removed: 0 });

  // Argentina es UTC−3 todo el año: su día empieza a las 03:00 UTC.
  const day = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const { data: loaded, error: countError } = await admin
    .from("movements")
    .select("user_id")
    .gte("created_at", `${day}T03:00:00Z`)
    .in("user_id", [...new Set(list.map((s) => s.user_id))])
    .limit(10000);
  if (countError)
    return Response.json({ error: countError.message }, { status: 500 });
  const counts = new Map<string, number>();
  for (const row of loaded ?? [])
    counts.set(row.user_id, (counts.get(row.user_id) ?? 0) + 1);

  const gone: string[] = [];
  let sent = 0;
  await Promise.all(
    list.map(async (s) => {
      const count = counts.get(s.user_id) ?? 0;
      const payload = count
        ? {
            title:
              count === 1
                ? "Hoy anotaste 1 movimiento"
                : `Hoy anotaste ${count} movimientos`,
            body: "¿Falta alguno? Tocá para sumarlo.",
          }
        : {
            title: "¿Cargaste los gastos de hoy?",
            body: "Todavía no anotaste nada hoy. Tocá para cargarlo en un minuto.",
          };
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ ...payload, url: "/gasto" }),
          // Si el teléfono está apagado, después de tres horas ya no tiene sentido.
          { TTL: 3 * 3600 },
        );
        sent++;
      } catch (e) {
        // 404 o 410: el navegador dio de baja esa suscripción.
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) gone.push(s.endpoint);
        else console.error("recordatorio", status, (e as Error).message);
      }
    }),
  );
  if (gone.length)
    await admin.from("push_subscriptions").delete().in("endpoint", gone);
  return Response.json({ sent, removed: gone.length });
}
