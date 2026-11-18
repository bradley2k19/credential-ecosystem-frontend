"use client";

import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";
import type { LoginResponse } from "@/lib/api";
import {
  clearSession,
  isUserRole,
  readSession,
  removeLegacySharedSession,
  saveSession,
  subscribeSession,
  type Session,
  type SessionUser,
  type UserRole,
} from "@/lib/session";

export type { UserRole };
export type AuthUser = SessionUser;
interface AuthContextValue { user: AuthUser | null; token: string | null; isLoading: boolean; login: (response: LoginResponse) => void; logout: () => void }

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Before the browser has been read (server render and hydration) the session is not known yet.
const NOT_READ = "not-read" as const;
const notRead = () => NOT_READ;

function userFromResponse(response: LoginResponse): AuthUser {
  const data = response.data ?? response;
  const payload = data.user ?? data;
  return {
    id: String(payload.id ?? ""),
    email: String(payload.email ?? ""),
    role: isUserRole(payload.role) ? payload.role.toLowerCase() as UserRole : "student",
  };
}

/**
 * Provides this tab's session to the app. The session itself lives in the session module (per tab, in
 * sessionStorage); this context only reflects it, and updates as soon as it is saved or cleared.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const snapshot = useSyncExternalStore<Session | null | typeof NOT_READ>(subscribeSession, readSession, notRead);
  const isLoading = snapshot === NOT_READ;
  const session = isLoading ? null : snapshot;

  // On app start: delete any session an older build left in localStorage, shared by every tab.
  useEffect(() => {
    removeLegacySharedSession();
  }, []);

  function handleLogin(response: LoginResponse) {
    const data = response.data ?? response;
    const nextToken = data.token ?? data.accessToken ?? data.access_token;
    if (!nextToken) throw new Error("Login succeeded, but no session token was returned.");
    // Production would preferably use httpOnly cookies for stronger XSS protection;
    // that requires backend changes beyond this pass.
    saveSession(nextToken, userFromResponse(response));
  }

  /** Signs out this tab only; other tabs keep their own sessions. */
  function logout() {
    clearSession();
  }

  return (
    <AuthContext.Provider value={{ user: session?.user ?? null, token: session?.token ?? null, isLoading, login: handleLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
