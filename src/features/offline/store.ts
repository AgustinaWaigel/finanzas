import type { Category, Currency, PaymentMethod } from "../finance/model";
import type { NewMovement } from "../movements/build";

// Todo lo que se guarda en el dispositivo para poder anotar sin conexión.
// No incluye movimientos ya sincronizados ni tickets.
export type QueuedMovement = NewMovement & { error?: string };
export type Snapshot = {
  categories: Category[];
  currencies: Currency[];
  familyEnabled: boolean;
  familyId: string | null;
  familyName: string | null;
  paymentsEnabled?: boolean;
  methods?: PaymentMethod[];
};
export type LastUser = { id: string; email: string };

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

const queueKey = (userId: string) => `clara:queue:${userId}`;
const snapshotKey = (userId: string) => `clara:snapshot:${userId}`;
const lastUserKey = "clara:last-user";

export const readQueue = (userId: string) =>
  read<QueuedMovement[]>(queueKey(userId)) ?? [];
export function writeQueue(userId: string, items: QueuedMovement[]) {
  if (!write(queueKey(userId), items.length ? items : null))
    throw new Error(
      "Este dispositivo no permite guardar datos sin conexión. Reintentá cuando vuelva la red.",
    );
}
export const readSnapshot = (userId: string) =>
  read<Snapshot>(snapshotKey(userId));
export const writeSnapshot = (userId: string, snapshot: Snapshot | null) =>
  write(snapshotKey(userId), snapshot);
export const readLastUser = () => read<LastUser>(lastUserKey);
export const writeLastUser = (user: LastUser | null) =>
  write(lastUserKey, user);

export function isOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}
// supabase-js devuelve los fallos de red como errores con el texto del fetch.
export function isNetworkError(e: unknown) {
  const message = String((e as { message?: string })?.message ?? e);
  return (
    isOffline() ||
    /failed to fetch|networkerror|load failed|network request failed/i.test(
      message,
    )
  );
}
