"use client";
import { useEffect, useRef } from "react";
import { Receipt, Plus, X } from "lucide-react";
export function Empty({
  title,
  text,
  action,
  actionLabel = "Agregar movimiento",
}: {
  title: string;
  text: string;
  action?: () => void;
  actionLabel?: string;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Receipt size={25} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action && (
        <button className="text-button" onClick={action}>
          <Plus size={16} />
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function ModalShell({
  title,
  children,
  close,
  busy,
}: {
  title: string;
  children: React.ReactNode;
  close: () => void;
  busy: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) close();
      }}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) close();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button
          disabled={busy}
          className="icon-button"
          aria-label="Cerrar"
          onClick={close}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
