"use client";
import { useEffect, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  type Movement,
  type Currency,
  type Category,
  money,
} from "../finance/model";
export function MovementDetail({
  item,
  currency,
  category,
  edit,
  remove,
  busy,
}: {
  item: Movement;
  currency: Currency;
  category?: Category;
  edit: () => void;
  remove: () => void;
  busy: boolean;
}) {
  const [url, setUrl] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    if (item.receipt_path)
      supabase!.storage
        .from("receipts")
        .download(item.receipt_path)
        .then(({ data, error }) => {
          if (!live) return;
          if (error) setError("No se pudo cargar el ticket.");
          else if (data) setUrl(URL.createObjectURL(data));
        });
    return () => {
      live = false;
    };
  }, [item.receipt_path]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  return (
    <div>
      <p className="eyebrow">
        {item.kind === "expense" ? "Gasto" : "Ingreso"} · {item.currency}
      </p>
      <h3 className="detail-amount">{money(item.amount, currency)}</h3>
      <dl>
        <dt>Concepto</dt>
        <dd>{item.name}</dd>
        <dt>Fecha</dt>
        <dd>{item.date.split("-").reverse().join("/")}</dd>
        <dt>Categoría</dt>
        <dd>{category?.name || "Sin categoría"}</dd>
        <dt>Referencia</dt>
        <dd className="note-text">{item.reference || "Sin referencia"}</dd>
        <dt>Nota</dt>
        <dd className="note-text">{item.note || "Sin nota"}</dd>
      </dl>
      {error && <p role="alert">{error}</p>}
      {item.receipt_path && !url && !error && <p>Cargando ticket privado…</p>}
      {url && (
        <a href={url} target="_blank" rel="noreferrer">
          <img
            className="receipt-image"
            src={url}
            alt={`Ticket de ${item.name}`}
          />
        </a>
      )}
      <div className="row-actions">
        <button disabled={busy} className="primary" onClick={edit}>
          <Pencil size={16} />
          Editar
        </button>
        <button disabled={busy} className="danger-link" onClick={remove}>
          <Trash2 size={16} />
          Eliminar movimiento
        </button>
      </div>
    </div>
  );
}
