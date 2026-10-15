"use client";
import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { errorText } from "@/lib/errors";
import { supabase } from "@/lib/supabase";

const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
// La clave pública viaja en base64 "URL-safe"; el navegador la pide en bytes.
function keyBytes(key: string) {
  const base64 = (key + "=".repeat((4 - (key.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
}
const supported = () =>
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

// Al cerrar sesión el dispositivo deja de recibir los avisos de esa cuenta.
export async function removePushSubscription() {
  try {
    if (!supported()) return;
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;
    await supabase!
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", subscription.endpoint);
    await subscription.unsubscribe();
  } catch {}
}

// Activa o desactiva en ESTE dispositivo el recordatorio diario de las 21.
export function ReminderCard() {
  const [state, setState] = useState<
    "loading" | "unsupported" | "off" | "on" | "blocked"
  >("loading");
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!supported()) return setState("unsupported");
    if (Notification.permission === "denied") return setState("blocked");
    let live = true;
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => live && setState(subscription ? "on" : "off"))
      .catch(() => live && setState("unsupported"));
    return () => {
      live = false;
    };
  }, []);
  async function run(action: () => Promise<string>) {
    setBusy(true);
    setFailed(false);
    setMessage("");
    try {
      setMessage(await action());
    } catch (e) {
      setFailed(true);
      setMessage(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const enable = () =>
    run(async () => {
      if ((await Notification.requestPermission()) !== "granted") {
        setState(Notification.permission === "denied" ? "blocked" : "off");
        throw new Error("Sin permiso no se pueden mostrar notificaciones.");
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes(publicKey!),
      });
      const { endpoint, keys } = subscription.toJSON();
      const { error } = await supabase!
        .from("push_subscriptions")
        .upsert({ endpoint, p256dh: keys?.p256dh, auth: keys?.auth });
      if (error) {
        await subscription.unsubscribe();
        throw error.code === "PGRST205" || error.code === "42P01"
          ? new Error(
              "Falta aplicar la migración 202610090007_push_reminders.sql en Supabase.",
            )
          : error;
      }
      setState("on");
      return "Listo: este dispositivo va a avisarte todos los días a las 21.";
    });
  const disable = () =>
    run(async () => {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await supabase!
          .from("push_subscriptions")
          .delete()
          .eq("endpoint", subscription.endpoint);
        await subscription.unsubscribe();
      }
      setState("off");
      return "Recordatorio desactivado en este dispositivo.";
    });
  const preview = () =>
    run(async () => {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification("¿Cargaste los gastos de hoy?", {
        body: "Así se va a ver el recordatorio. Tocá para cargar.",
        icon: "/icons/icon-192.png",
        data: { url: "/gasto" },
      });
      return "Te mostramos una notificación de prueba.";
    });
  return (
    <section className="card">
      <h2>
        <BellRing size={19} /> Recordatorio de las 21
      </h2>
      <p className="help">
        Todos los días a las 21 (hora de Argentina) te avisa si todavía no
        cargaste nada, o cuántos movimientos anotaste por si falta alguno. Se
        activa por dispositivo.
      </p>
      {message && (
        <p className={failed ? "alert" : "notice"} role="status">
          {message}
        </p>
      )}
      {!publicKey ? (
        <p className="help">
          Falta configurar las claves de notificaciones en el servidor (ver
          README, “Recordatorio diario”).
        </p>
      ) : state === "unsupported" ? (
        <p className="help">
          Este navegador no admite notificaciones de la app. En iPhone hay que
          instalarla primero: Safari → Compartir → Agregar a pantalla de inicio,
          y activarlo desde la app instalada (iOS 16.4 o posterior).
        </p>
      ) : state === "blocked" ? (
        <p className="help">
          Las notificaciones están bloqueadas para este sitio. Habilitalas desde
          los ajustes del navegador o del sistema y volvé a entrar.
        </p>
      ) : state === "on" ? (
        <div className="row-actions">
          <button
            className="text-button"
            disabled={busy}
            onClick={() => void preview()}
          >
            Ver una de prueba
          </button>
          <button
            className="danger-link"
            disabled={busy}
            onClick={() => void disable()}
          >
            Desactivar en este dispositivo
          </button>
        </div>
      ) : (
        <button
          className="primary"
          disabled={busy || state === "loading"}
          onClick={() => void enable()}
        >
          Activar recordatorio
        </button>
      )}
    </section>
  );
}
