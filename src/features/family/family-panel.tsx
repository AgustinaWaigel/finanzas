"use client";
import { useEffect, useState } from "react";
import { Copy, Plus, Users, Smartphone, Share2 } from "lucide-react";
import { invitationLink, invitationToken } from "./invitation";
import { supabase } from "@/lib/supabase";
import { errorText } from "@/lib/errors";
export type Family = { id: string; name: string; owner_id: string };
export type FamilyMember = {
  user_id: string;
  family_id: string;
  display_name: string;
};
export function FamilyPanel({
  family,
  members,
  enabled,
  userId,
  onChange,
}: {
  family: Family | null;
  members: FamilyMember[];
  enabled: boolean;
  userId: string;
  onChange: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [shareLink, setShareLink] = useState(""),
    [message, setMessage] = useState("");
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const owner = family?.owner_id === userId;
  return (
    <div className="family-layout">
      <section className="card">
        <div className="section-heading">
          <div>
            <h2>
              <Users size={19} /> {family?.name || "Tu grupo familiar"}
            </h2>
            <p>Un espacio compartido, una cuenta para cada integrante.</p>
          </div>
        </div>
        {!enabled ? (
          <div className="alert">
            Falta aplicar la migración <code>202609280002_families.sql</code> en
            el SQL Editor de Supabase. Tus datos personales siguen disponibles.
          </div>
        ) : (
          <>
            {error && (
              <p className="alert" role="alert">
                {error}
              </p>
            )}
            {message && (
              <p className="notice" role="status">
                {message}
              </p>
            )}
            {family ? (
              <>
                <p className="help">
                  Todos pueden ver, agregar, editar y eliminar movimientos, 
                  categorías y presupuestos del grupo. Los datos del
                  espacio personal no se comparten.
                </p>
                <div className="family-members">
                  {members.map((m) => (
                    <div key={m.user_id}>
                      <span className="avatar">
                        {m.display_name[0]?.toUpperCase()}
                      </span>
                      <span className="grow">
                        <strong>
                          {m.display_name}
                          {m.user_id === userId ? " (vos)" : ""}
                        </strong>
                        <small>
                          {m.user_id === family.owner_id
                            ? "Administrador"
                            : "Integrante"}
                        </small>
                      </span>
                      {m.user_id !== family.owner_id &&
                        (owner || m.user_id === userId) && (
                          <button
                            className="danger-link"
                            disabled={busy}
                            onClick={() => {
                              if (
                                confirm(
                                  m.user_id === userId
                                    ? "¿Salir del grupo? Los datos compartidos quedan en la familia y dejarás de verlos."
                                    : `¿Quitar a ${m.display_name}? Sus movimientos se conservan en el grupo.`,
                                )
                              )
                                void run(async () => {
                                  const { error } = await supabase!.rpc(
                                    "remove_family_member",
                                    { member_id: m.user_id },
                                  );
                                  if (error) throw error;
                                  await onChange();
                                });
                            }}
                          >
                            {m.user_id === userId ? "Salir" : "Quitar"}
                          </button>
                        )}
                    </div>
                  ))}
                </div>
                {owner && (
                  <div className="invite-box">
                    <h3>Sumá a tu familia</h3>
                    <p className="help">
                      Generá un enlace y compartilo por el medio que prefieras.
                      Sirve para una persona, vence en 7 días y reemplaza al
                      enlace anterior.
                    </p>
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const { data, error } = await supabase!.rpc(
                            "create_family_invite",
                          );
                          if (error) throw error;
                          setShareLink(
                            invitationLink(window.location.origin, data),
                          );
                        })
                      }
                    >
                      <Plus size={16} />
                      Generar invitación
                    </button>
                    {shareLink && (
                      <>
                        <label className="invite-code">
                          Enlace de invitación
                          <input
                            readOnly
                            value={shareLink}
                            onFocus={(e) => e.target.select()}
                          />
                        </label>
                        <button
                          className="text-button"
                          onClick={() =>
                            void run(async () => {
                              await navigator.clipboard.writeText(shareLink);
                              setMessage("Enlace copiado.");
                            })
                          }
                        >
                          <Copy size={16} />
                          Copiar enlace
                        </button>
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              if (navigator.share) {
                                try {
                                  await navigator.share({
                                    title: "Sumate a nuestra familia en Clara",
                                    text: "Te invito a compartir nuestras finanzas familiares.",
                                    url: shareLink,
                                  });
                                } catch (e) {
                                  if (
                                    (e as { name?: string }).name !==
                                    "AbortError"
                                  )
                                    throw e;
                                }
                              } else {
                                await navigator.clipboard.writeText(shareLink);
                                setMessage("Enlace copiado para compartir.");
                              }
                            })
                          }
                        >
                          <Share2 size={16} />
                          Compartir
                        </button>
                      </>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="family-forms">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void run(async () => {
                      const { error } = await supabase!.rpc("create_family", {
                        family_name: String(f.get("family_name")).trim(),
                        member_name: String(f.get("member_name")).trim(),
                        share_existing: f.get("share") === "on",
                      });
                      if (error) throw error;
                      await onChange();
                    });
                  }}
                >
                  <h3>Crear un grupo</h3>
                  <label>
                    Nombre del grupo
                    <input
                      name="family_name"
                      required
                      maxLength={60}
                      placeholder="Ej. Familia García"
                    />
                  </label>
                  <label>
                    Tu nombre
                    <input name="member_name" required maxLength={60} />
                  </label>
                  <label className="checkbox">
                    <input name="share" type="checkbox" defaultChecked />
                    Compartir mis movimientos, categorías y presupuestos
                  </label>
                  <p className="help">
                    Si elegís compartir, tus datos actuales pasan al grupo y sus
                    integrantes podrán modificarlos. Si no, el grupo empieza sin
                    movimientos.
                  </p>
                  <button className="primary full" disabled={busy}>
                    Crear grupo familiar
                  </button>
                </form>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void run(async () => {
                      const token = invitationToken(
                        String(f.get("invite_link")).trim(),
                        window.location.origin,
                      );
                      if (!token)
                        throw new Error(
                          "Pegá el enlace completo de invitación a esta app.",
                        );
                      window.location.assign(
                        invitationLink(window.location.origin, token),
                      );
                    });
                  }}
                >
                  <h3>Unirme a mi familia</h3>
                  <label>
                    Enlace de invitación
                    <input
                      name="invite_link"
                      type="url"
                      required
                      autoComplete="off"
                      placeholder="Pegá el enlace que te compartieron"
                    />
                  </label>
                  <p className="help">
                    También podés abrir directamente el enlace que recibiste.
                    Tus datos personales se conservan separados.
                  </p>
                  <button className="primary full" disabled={busy}>
                    Abrir invitación
                  </button>
                </form>
              </div>
            )}
          </>
        )}
      </section>
      <QuickAccess userId={userId} />
    </div>
  );
}
function QuickAccess({ userId }: { userId: string }) {
  const [first, setFirst] = useState(true);
  useEffect(() => {
    try {
      setFirst(
        localStorage.getItem(`clara:expense-first:${userId}`) !== "false",
      );
    } catch {}
  }, [userId]);
  return (
    <section className="card quick-access">
      <h2>
        <Smartphone size={19} /> Un toque para cargar un gasto
      </h2>
      <p className="help">
        Abrí este acceso en el navegador del celular y agregalo a la pantalla de
        inicio. Te lleva directamente al formulario; al cerrarlo o guardar,
        aparece el resumen.
      </p>
      <a className="primary" href="/gasto">
        Abrir acceso «Agregar gasto»
      </a>
      <a className="text-button" href="/panel">
        Abrir solo el resumen
      </a>
      <p className="help">
        <strong>iPhone:</strong> en Safari, Compartir → Agregar a pantalla de
        inicio. <strong>Android:</strong> menú del navegador → Instalar o
        Agregar a pantalla de inicio. La opción de tener un segundo ícono
        depende del navegador; el ícono de Clara también abre primero el
        formulario.
      </p>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={first}
          onChange={(e) => {
            setFirst(e.target.checked);
            try {
              localStorage.setItem(
                `clara:expense-first:${userId}`,
                String(e.target.checked),
              );
            } catch {}
          }}
        />
        Al abrir la página principal en este celular, mostrar primero el
        formulario
      </label>
      <p className="help">
        Necesitás iniciar sesión una vez. Los accesos directos mantienen la
        protección de tu cuenta.
      </p>
    </section>
  );
}
