const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = "clara:pending-invitation";
export function invitationLink(origin: string, token: string) {
  if (!UUID.test(token)) throw new Error("La invitación no es válida.");
  const url = new URL("/unirse", origin);
  url.hash = token;
  return url.href;
}
export function invitationToken(link: string, origin: string): string | null {
  try {
    const url = new URL(link);
    const token = url.hash.slice(1);
    return url.origin === new URL(origin).origin &&
      url.pathname === "/unirse" &&
      UUID.test(token)
      ? token
      : null;
  } catch {
    return null;
  }
}
export function rememberInvitation(token: string) {
  if (!UUID.test(token)) return;
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ token, expires: Date.now() + 7 * 24 * 60 * 60 * 1000 }),
    );
  } catch {}
}
export function pendingInvitation(): string | null {
  try {
    const item = JSON.parse(localStorage.getItem(KEY) || "null");
    return item && UUID.test(item.token) && item.expires > Date.now()
      ? item.token
      : null;
  } catch {
    return null;
  }
}
export function clearInvitation() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
