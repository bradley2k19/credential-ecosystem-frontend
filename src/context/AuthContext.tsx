"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { LoginResponse } from "@/lib/api";

export type UserRole = "institution" | "student" | "employer";
export interface AuthUser { id: string; email: string; role: UserRole }
interface AuthContextValue { user: AuthUser | null; token: string | null; isLoading: boolean; login: (response: LoginResponse) => void; logout: () => void }

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const TOKEN_KEY = "credential-ecosystem-token";
const USER_KEY = "credential-ecosystem-user";

function isUserRole(role: unknown): role is UserRole {
  return typeof role === "string" && ["institution", "student", "employer"].includes(role.toLowerCase());
}

function userFromResponse(response: LoginResponse): AuthUser {
  const data = response.data ?? response;
  const payload = data.user ?? data;
  return {
    id: String(payload.id ?? ""),
    email: String(payload.email ?? ""),
    role: isUserRole(payload.role) ? payload.role.toLowerCase() as UserRole : "student",
  };
}

function userFromToken(token: string): AuthUser | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1])) as Record<string, unknown>;
    if (typeof payload.email !== "string" || !isUserRole(payload.role)) return null;
    return { id: String(payload.id ?? payload.sub ?? ""), email: payload.email, role: payload.role };
  } catch { return null; }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedToken = window.localStorage.getItem(TOKEN_KEY);
    const storedUser = window.localStorage.getItem(USER_KEY);
    // localStorage is only available after hydration, so restore the session here.
    if (storedToken) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setToken(storedToken);
      setUser(storedUser ? (JSON.parse(storedUser) as AuthUser) : userFromToken(storedToken));
    }
    setIsLoading(false);
  }, []);

  function handleLogin(response: LoginResponse) {
    const data = response.data ?? response;
    const nextToken = data.token ?? data.accessToken ?? data.access_token;
    if (!nextToken) throw new Error("Login succeeded, but no session token was returned.");
    // Production would preferably use httpOnly cookies for stronger XSS protection;
    // that requires backend changes beyond this pass.
    const nextUser = userFromResponse(response);
    window.localStorage.setItem(TOKEN_KEY, nextToken);
    window.localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    setToken(nextToken);
    setUser(nextUser);
  }

  function logout() {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, token, isLoading, login: handleLogin, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}