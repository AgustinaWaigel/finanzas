"use client";
import { useState } from "react";
import { UserX } from "lucide-react";
import { errorText } from "@/lib/errors";
import { supabase } from "@/lib/supabase";

// Los tickets viejos viven en Storage bajo la carpeta del usuario; SQL no puede borrarlos.
async function removeOwnReceipts(userId: string) {
  const bucket = supabase!.storage.from("receipts");
  for (let page = 0; page < 20; page++) {
    const { data, error } = await bucket.list(userId, { limit: 100 });
    if (error || !data?.length) return;
    const result = await bucket.remove(data.map((f) => `${userId}/${f.name}`));
    if (result.error) return;
  }
}

export function AccountPanel({
  userId,
  email,
  ownsSharedFamily,
  deleted,
}: {
  userId: string;
  email: string;
  // Administra un grupo con más integrantes: primero tiene que resolverlo.
  ownsSharedFamily: boolean;
  deleted: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false),
    [typed, setTyped] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <section className="card">
      <h2>
        <UserX size={19} /> Tu cuenta
      </h2>
      <p className="help">
        Ingresaste como <strong>{email}</strong>. Eliminar la cuenta borra para
        siempre tus movimientos, categorías y presupuestos personales. Lo que
        cargaste en un grupo familiar queda en el grupo, a nombre de su
        administrador.
      </p>
      {ownsSharedFamily ? (
        <p className="help">
          Administrás un grupo con otros integrantes: transferí la
          administración o eliminá el grupo antes de borrar tu cuenta.
        </p>
      ) : !open ? (
        <button className="danger-link" onClick={() => setOpen(true)}>
          Eliminar mi cuenta
        </button>
      ) : (
        <form
          className="danger-zone"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await removeOwnReceipts(userId);
              const { error } = await supabase!.rpc("delete_account");
              if (error) throw error;
              await deleted();
            } catch (e) {
              setError(errorText(e));
              setBusy(false);
            }
          }}
        >
          {error && (
            <p className="alert" role="alert">
              {error}
            </p>
          )}
          <label>
            Para confirmar, escribí tu correo
            <input
              type="email"
              autoComplete="off"
              required
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={email}
            />
          </label>
          <p className="help">
            Esta acción no se puede deshacer. Si querés conservar una copia,
            exportá antes tus movimientos desde Movimientos → Exportar.
          </p>
          <div className="row-actions">
            <button
              className="danger-button"
              disabled={
                busy || typed.trim().toLowerCase() !== email.toLowerCase()
              }
            >
              {busy ? "Eliminando…" : "Eliminar mi cuenta definitivamente"}
            </button>
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                setTyped("");
                setError("");
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
