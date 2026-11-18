/**
 * The login session of this browser tab: the token and the signed-in user.
 *
 * It lives in sessionStorage, so every tab keeps its own login and different tabs can be signed in as
 * different roles at the same time. This module is the only code that reads, writes or clears it. It is
 * session data only: display preferences (such as the sidebar state) are kept elsewhere, in localStorage.
 */

export type UserRole = "institution" | "student" | "employer" | "admin";

export interface SessionUser {
  id: string;
  email: string;
  role: UserRole;
}

export interface Session {
  token: string;
  user: SessionUser;
}

/** The existing key names, now in sessionStorage. Older builds kept them in localStorage, shared by every tab. */
const TOKEN_KEY = "credential-ecosystem-token";
const USER_KEY = "credential-ecosystem-user";

const USER_ROLES: UserRole[] = ["institution", "student", "employer", "admin"];

export function isUserRole(role: unknown): role is UserRole {
  return typeof role === "string" && (USER_ROLES as string[]).includes(role.toLowerCase());
}

function tabStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null; // Storage can be blocked by the browser; the tab then simply has no session.
  }
}

/** The user encoded in the token, for a session saved without its user record. */
function userFromToken(token: string): SessionUser | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1])) as Record<string, unknown>;
    if (typeof payload.email !== "string" || !isUserRole(payload.role)) return null;
    return { id: String(payload.id ?? payload.sub ?? ""), email: payload.email, role: payload.role.toLowerCase() as UserRole };
  } catch {
    return null;
  }
}

function parseUser(raw: string | null): SessionUser | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<SessionUser>;
    if (typeof value?.email !== "string" || !isUserRole(value.role)) return null;
    return { id: String(value.id ?? ""), email: value.email, role: value.role.toLowerCase() as UserRole };
  } catch {
    return null;
  }
}

// The last session read, kept while the stored values are unchanged, so readers get the same object back.
let lastRead: { raw: string; session: Session | null } | null = null;
const listeners = new Set<() => void>();

/** This tab's session, or null when signed out. */
export function readSession(): Session | null {
  const storage = tabStorage();
  const token = storage?.getItem(TOKEN_KEY) ?? null;
  const rawUser = storage?.getItem(USER_KEY) ?? null;
  const raw = `${token}\u0000${rawUser}`;
  if (lastRead?.raw === raw) return lastRead.session;
  const user = token ? parseUser(rawUser) ?? userFromToken(token) : null;
  const session = token && user ? { token, user } : null;
  lastRead = { raw, session };
  return session;
}

/** The token to send with a request. Read fresh every time, never kept in a variable. */
export function getSessionToken(): string | null {
  return readSession()?.token ?? null;
}

export function getSessionUser(): SessionUser | null {
  return readSession()?.user ?? null;
}

/** Signs this tab in. Other tabs are not affected. */
export function saveSession(token: string, user: SessionUser) {
  const storage = tabStorage();
  storage?.setItem(TOKEN_KEY, token);
  storage?.setItem(USER_KEY, JSON.stringify(user));
  notify();
}

/** Signs this tab out. Other tabs keep their own sessions. */
export function clearSession() {
  const storage = tabStorage();
  storage?.removeItem(TOKEN_KEY);
  storage?.removeItem(USER_KEY);
  notify();
}

/**
 * Deletes a session left in localStorage by older builds, which shared one login across every tab, so it
 * can never be picked up again. Run once when the app starts.
 */
export function removeLegacySharedSession() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USER_KEY);
  } catch {
    // Nothing to remove when storage is unavailable.
  }
}

/** Calls `listener` whenever this tab's session is saved or cleared. */
export function subscribeSession(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify() {
  listeners.forEach((listener) => listener());
}
