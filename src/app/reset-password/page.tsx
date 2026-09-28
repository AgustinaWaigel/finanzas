"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
export default function ResetPassword() {
  const [ready, setReady] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!supabase) return;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (
        session &&
        (event === "PASSWORD_RECOVERY" ||
          event === "SIGNED_IN" ||
          event === "INITIAL_SESSION")
      )
        setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);
  return (
    <main style={{ margin: 0 }} className="center-screen">
      <section className="card" style={{ maxWidth: 420, margin: 20 }}>
        <h1>Nueva contraseña</h1>
        <p className="help">
          Abrí el enlace enviado a tu correo para recuperar tu acceso.
        </p>
        {ready && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (f.get("password") !== f.get("confirm")) {
                setMessage("Las contraseñas no coinciden.");
                return;
              }
              setBusy(true);
              const { error } = await supabase!.auth.updateUser({
                password: String(f.get("password")),
              });
              setBusy(false);
              setMessage(
                error
                  ? error.message
                  : "Contraseña actualizada. Ya podés volver a tu espacio.",
              );
            }}
          >
            <label>
              Contraseña
              <input
                name="password"
                type="password"
                minLength={8}
                required
                autoComplete="new-password"
              />
            </label>
            <label>
              Repetí la contraseña
              <input
                name="confirm"
                type="password"
                minLength={8}
                required
                autoComplete="new-password"
              />
            </label>
            <button className="primary full" disabled={busy}>
              Guardar contraseña
            </button>
          </form>
        )}
        {message && (
          <p className="help" role="status">
            {message}
          </p>
        )}
        <a className="text-button full" href="/">
          Volver a Clara
        </a>
      </section>
    </main>
  );
}
