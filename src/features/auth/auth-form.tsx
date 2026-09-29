"use client";
import { useEffect, useState } from "react";
import { ArrowUpRight, Leaf, Check, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { errorText } from "@/lib/errors";
export function Auth({ configured }: { configured: boolean }) {
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login"),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const query = new URLSearchParams(window.location.search);
    if (hash.has("error") || query.has("error")) {
      setMessage(
        "No se pudo completar el acceso con Google. Volvé a intentarlo o ingresá con tu correo.",
      );
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);
  async function signInWithGoogle() {
    setBusy(true);
    setMessage("");
    try {
      const { error } = await supabase!.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo:
            window.location.origin +
            (window.location.pathname === "/unirse"
              ? "/"
              : window.location.pathname),
        },
      });
      if (error) throw error;
    } catch (error) {
      setMessage(errorText(error));
      setBusy(false);
    }
  }
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
            Claridad en tus finanzas.
            <br />
            Menos preocupaciones.
          </h1>
          <p>
            Un espacio simple para entender tus gastos, planear tu mes y cuidar
            tu futuro.
          </p>
          <div className="auth-features">
            <span>
              <Check />
              Tus números, siempre claros
            </span>
            <span>
              <Check />
              Cada gasto, bien identificado
            </span>
            <span>
              <Check />
              Tu información, bajo tu control
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
                Configurá Supabase para activar tu cuenta y guardar movimientos.
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
              {mode !== "reset" && (
                <>
                  <button
                    type="button"
                    className="google-signin full"
                    disabled={busy}
                    onClick={signInWithGoogle}
                  >
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        fill="#4285F4"
                        d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.89-1.74 2.98-4.3 2.98-7.36Z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.04.97-3.38.97-2.6 0-4.81-1.76-5.6-4.12H3.05v2.59A10 10 0 0 0 12 22Z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M6.4 13.93a6 6 0 0 1 0-3.86V7.48H3.05a10 10 0 0 0 0 9.04l3.35-2.59Z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.95c1.47 0 2.79.51 3.83 1.51l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.95 5.48l3.35 2.59C7.19 7.71 9.4 5.95 12 5.95Z"
                      />
                    </svg>
                    Continuar con Google
                  </button>
                  <p className="auth-divider">o con tu correo</p>
                </>
              )}
              <form onSubmit={submit}>
                <label>
                  Correo electrónico
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    placeholder="JuanPerez@ejemplo.com"
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
              <p className="help">
                Tu sesión queda guardada en este dispositivo para que puedas
                volver y cargar gastos rápido.
              </p>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
