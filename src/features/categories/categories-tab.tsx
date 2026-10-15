import { Pencil, Tags } from "lucide-react";
import { Empty } from "@/components/ui";
import type { Category } from "../finance/model";

export function CategoriesTab({
  categories,
  create,
  edit,
}: {
  categories: Category[];
  create: () => void;
  edit: (item: Category) => void;
}) {
  return (
    <section className="card">
      <div className="section-heading">
        <div>
          <h2>Un lugar para cada movimiento</h2>
          <p>
            Desactivá las categorías que ya no usás. Su historial se conserva.
          </p>
        </div>
        <span className="badge">{categories.length} categorías</span>
      </div>
      <div className="category-grid">
        {categories.map((c) => (
          <button
            key={c.id}
            className={`category-tile ${!c.active ? "inactive" : ""}`}
            onClick={() => edit(c)}
          >
            <span className="category-swatch" style={{ background: c.color }}>
              <Tags size={18} />
            </span>
            <span className="grow">
              <strong>{c.name}</strong>
              <small>
                {c.kind === "expense" ? "Gasto" : "Ingreso"} ·{" "}
                {c.active ? "Activa" : "Desactivada"}
              </small>
            </span>
            <Pencil size={16} />
          </button>
        ))}
      </div>
      {!categories.length && (
        <Empty
          title="Creá tu primera categoría"
          text="Las categorías te ayudan a organizar tus finanzas."
          action={create}
          actionLabel="Nueva categoría"
        />
      )}
    </section>
  );
}

export function CategoryForm({
  item,
  busy,
  submit,
  remove,
}: {
  item?: Category;
  busy: boolean;
  submit: (form: FormData) => void;
  remove: (item: Category) => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(new FormData(e.currentTarget));
      }}
    >
      <label>
        Nombre
        <input name="name" required maxLength={60} defaultValue={item?.name} />
      </label>
      <div className="form-grid">
        <label>
          Color
          <input
            name="color"
            type="color"
            defaultValue={item?.color || "#176b51"}
          />
        </label>
        <label>
          Tipo
          <select name="kind" defaultValue={item?.kind || "expense"}>
            <option value="expense">Gasto</option>
            <option value="income">Ingreso</option>
          </select>
        </label>
      </div>
      <label className="checkbox">
        <input
          name="active"
          type="checkbox"
          defaultChecked={item?.active ?? true}
        />
        Categoría activa
      </label>
      <p className="help">
        Si tiene movimientos o presupuestos, podés desactivarla; no se puede
        eliminar ni cambiar su tipo.
      </p>
      <button disabled={busy} className="primary full">
        {busy ? "Guardando…" : "Guardar categoría"}
      </button>
      {item && (
        <button
          type="button"
          disabled={busy}
          className="danger-link full"
          onClick={() => remove(item)}
        >
          Eliminar categoría
        </button>
      )}
    </form>
  );
}
