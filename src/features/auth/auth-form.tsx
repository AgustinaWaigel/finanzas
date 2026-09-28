"use client";
import { useState } from "react";
import { ArrowUpRight, Leaf, Check, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { errorText } from "@/lib/errors";
export function Auth({ configured }: { configured: boolean }) {
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login"),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    const f = new FormData(e.currentTarget);
    try {
      const email = String(f.get("email")),
        password = String(f.get("password"));
      if (mode === "reset") {
        const { error } = await supabase!.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + "/reset-password",
        });
        if (error) throw error;
        setMessage(
          "Si la cuenta existe, vas a recibir un correo para recuperar tu contraseña.",
        );
      } else {
        const result =
          mode === "signup"
            ? await supabase!.auth.signUp({
                email,
                password,
                options: { emailRedirectTo: window.location.origin },
              })
            : await supabase!.auth.signInWithPassword({ email, password });
        if (result.error) throw result.error;
        if (mode === "signup")
          setMessage("Revisá tu correo para confirmar la cuenta y empezar.");
      }
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <section className="auth-story">
        <a className="brand" href="/">
          <span className="brand-icon">
            <Leaf />
          </span>
          clara.
        </a>
        <div>
          <span className="eyebrow">TU DINERO. TUS DECISIONES.</span>
          <h1>
            Un poco de orden.
            <br />
            Mucho más aire.
          </h1>
          <p>
            Un espacio simple para entender tus gastos, planear tu mes y cuidar
            lo que viene.
          </p>
          <div className="auth-features">
            <span>
              <Check />
              Cada moneda por separado
            </span>
            <span>
              <Check />
              Tus tickets, siempre a mano
            </span>
            <span>
              <Check />
              Tus datos, solo tuyos
            </span>
          </div>
        </div>
        <small>Más claridad. Más tranquilidad.</small>
      </section>
      <section className="auth-form">
        <div className="auth-card">
          {!configured ? (
            <>
              <span className="empty-icon">
                <Leaf />
              </span>
              <h2>Tu espacio está listo para conectar.</h2>
              <p>
                Configurá Supabase para activar tu cuenta, guardar movimientos y
                acceder a tus tickets privados.
              </p>
              <ol>
                <li>Creá un proyecto en Supabase.</li>
                <li>
                  Ejecutá la migración de la carpeta{" "}
                  <code>supabase/migrations</code>.
                </li>
                <li>
                  Completá <code>.env.local</code> siguiendo{" "}
                  <code>.env.example</code> y reiniciá la app.
                </li>
              </ol>
              <p className="help">
                Encontrás los pasos completos en el README del proyecto.
              </p>
            </>
          ) : (
            <>
              <div className="eyebrow">BIENVENIDO A CLARA</div>
              <h2>
                {mode === "signup"
                  ? "Empezá a ver más claro."
                  : mode === "reset"
                    ? "Recuperá tu acceso."
                    : "Qué bueno verte."}
              </h2>
              <p>
                {mode === "signup"
                  ? "Creá tu cuenta y organizá tus finanzas."
                  : mode === "reset"
                    ? "Te enviamos un enlace a tu correo."
                    : "Entrá a tu espacio personal."}
              </p>
              <form onSubmit={submit}>
                <label>
                  Correo electrónico
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    placeholder="vos@ejemplo.com"
                  />
                </label>
                {mode !== "reset" && (
                  <label>
                    Contraseña
                    <input
                      name="password"
                      type="password"
                      autoComplete={
                        mode === "login" ? "current-password" : "new-password"
                      }
                      minLength={8}
                      required
                      placeholder="Al menos 8 caracteres"
                    />
                  </label>
                )}
                {message && (
                  <p className="auth-message" role="status">
                    {message}
                  </p>
                )}
                <button disabled={busy} className="primary full">
                  {busy
                    ? "Un momento…"
                    : mode === "signup"
                      ? "Crear cuenta"
                      : mode === "reset"
                        ? "Enviar enlace"
                        : "Ingresar"}
                  <ArrowUpRight size={18} />
                </button>
              </form>
              <button
                className="text-button full"
                onClick={() => {
                  setMode(mode === "login" ? "signup" : "login");
                  setMessage("");
                }}
              >
                {mode === "login"
                  ? "¿Primera vez? Creá tu cuenta"
                  : "Ya tengo cuenta · Ingresar"}
              </button>
              {mode === "login" && (
                <button
                  className="subtle-button full"
                  onClick={() => setMode("reset")}
                >
                  Olvidé mi contraseña
                </button>
              )}
              <div className="auth-security">
                <ShieldCheck size={16} />
                Tu información es personal y privada.
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
