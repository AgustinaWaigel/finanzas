"use client";
import { useEffect, useState } from "react";
import { Leaf, WifiOff } from "lucide-react";
import { errorText } from "@/lib/errors";
import { MovementForm } from "@/features/movements/movement-form";
import { newMovements } from "@/features/movements/build";
import { readQueue, readSnapshot, writeQueue } from "./store";

// Pantalla mínima para anotar sin red. Usa las categorías de la última carga
// y deja los movimientos en una cola que se envía al reconectar.
export function OfflineCapture({
  userId,
  retry,
}: {
  userId: string;
  retry: () => void;
}) {
  const [snapshot] = useState(() => readSnapshot(userId));
  const [pending, setPending] = useState(() => readQueue(userId).length),
    [saved, setSaved] = useState(""),
    [error, setError] = useState(""),
    [formKey, setFormKey] = useState(0);
  useEffect(() => {
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [retry]);
  return (
    <div className="offline-screen">
      <div className="card offline-card">
        <span className="brand">
          <span className="brand-icon">
            <Leaf size={23} />
          </span>
          clara<span className="brand-dot">.</span>
        </span>
        <div className="offline-status" role="status">
          <WifiOff size={18} />
          <div>
            <strong>Estás sin conexión</strong>
            <small>
              {snapshot
                ? `Lo que anotes queda en este dispositivo y se sincroniza solo cuando vuelva la red. Se guarda en ${snapshot.familyName ? `“${snapshot.familyName}”` : "tu espacio personal"}.`
                : "Conectate a internet para consultar o guardar tus finanzas."}
            </small>
          </div>
        </div>
        {pending > 0 && (
          <p className="notice" role="status">
            {pending === 1
              ? "1 movimiento pendiente de sincronizar."
              : `${pending} movimientos pendientes de sincronizar.`}
          </p>
        )}
        {saved && !error && (
          <p className="notice" role="status">
            {saved}
          </p>
        )}
        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
        {snapshot && (
          <MovementForm
            key={formKey}
            categories={snapshot.categories}
            currencies={snapshot.currencies}
            currency={snapshot.currencies[0]?.code ?? "ARS"}
            busy={false}
            referenceEnabled={snapshot.familyEnabled}
            allowCreate={false}
            methods={snapshot.methods}
            submit={(form) => {
              try {
                const items = newMovements(form, snapshot.currencies, snapshot);
                const next = [...readQueue(userId), ...items];
                writeQueue(userId, next);
                setPending(next.length);
                setSaved(`Guardado: “${items[0].name}”.`);
                setError("");
                setFormKey((k) => k + 1);
              } catch (e) {
                setError(errorText(e));
              }
            }}
          />
        )}
        <button className="text-button full" onClick={retry}>
          Reintentar conexión
        </button>
      </div>
    </div>
  );
}
