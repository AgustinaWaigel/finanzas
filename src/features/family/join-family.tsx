"use client";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { errorText } from "@/lib/errors";
import { Auth } from "@/features/auth/auth-form";
import {
  invitationToken,
  pendingInvitation,
  rememberInvitation,
  clearInvitation,
} from "./invitation";
export function JoinFamily() {
  const [user, setUser] = useState<User | null>(null),
    [ready, setReady] = useState(false),
    [token, setToken] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [joined, setJoined] = useState(false);
  useEffect(() => {
    // El fragmento no se envía al servidor ni se incluye en Referer.
    const supplied = window.location.hash.length > 1;
    const found = supplied
      ? invitationToken(window.location.href, window.location.origin)
      : pendingInvitation();
    setToken(found);
    if (found) rememberInvitation(found);
    if (!supabase) {
      setReady(true);
      return;
    }
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);
  if (!ready) return <div className="center-screen">Abriendo invitación…</div>;
  if (!token)
    return (
      <div className="center-screen">
        <section className="card invitation-card">
          <h1>Enlace no válido</h1>
          <p className="help">
            Abrí el enlace completo que te compartió tu familiar o pedile una
            nueva invitación.
          </p>
          <a className="primary" href="/panel" onClick={clearInvitation}>
            Volver a Clara
          </a>
        </section>
      </div>
    );
  if (!user)
    return (
      <>
        <div className="invitation-banner">
          <Users size={18} />
          Te invitaron a un grupo familiar. Iniciá sesión o creá tu cuenta para
          continuar.
        </div>
        <Auth configured={!!supabase} />
      </>
    );
  return (
    <div className="center-screen">
      <section className="card invitation-card">
        <span className="empty-icon">
          <Users />
        </span>
        <h1>{joined ? "Ya sos parte de la familia" : "Unirme a mi familia"}</h1>
        {joined ? (
          <>
            <p className="help">
              Ya podés consultar y registrar los movimientos compartidos.
            </p>
            <a className="primary full" href="/panel">
              Ver las finanzas familiares
            </a>
          </>
        ) : (
          <>
            <p className="help">
              Vas a unirte con <strong>{user.email}</strong>. Todos los
              integrantes pueden ver, editar y eliminar los datos del grupo. Tu
              historial personal se conserva separado.
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                setBusy(true);
                setError("");
                try {
                  const { error } = await supabase!.rpc("join_family", {
                    invite_code: token,
                    member_name: String(f.get("member_name")).trim(),
                  });
                  if (error) throw error;
                  clearInvitation();
                  window.history.replaceState(null, "", "/unirse");
                  setJoined(true);
                } catch (e) {
                  setError(errorText(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                Tu nombre
                <input
                  autoFocus
                  name="member_name"
                  required
                  maxLength={60}
                  autoComplete="given-name"
                />
              </label>
              {error && (
                <p className="alert" role="alert">
                  {error}
                </p>
              )}
              <button className="primary full" disabled={busy}>
                {busy ? "Uniéndote…" : "Unirme al grupo"}
              </button>
            </form>
            <button
              className="text-button full"
              disabled={busy}
              onClick={async () => {
                const { error } = await supabase!.auth.signOut({
                  scope: "local",
                });
                if (error) setError(error.message);
              }}
            >
              Usar otra cuenta
            </button>
            <a
              className="text-button full"
              href="/panel"
              onClick={clearInvitation}
            >
              Ahora no · Volver a Clara
            </a>
          </>
        )}
      </section>
    </div>
  );
}
