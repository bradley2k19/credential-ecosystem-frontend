"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth(); const router = useRouter();
  useEffect(() => { if (!isLoading && !user) router.replace("/login"); }, [isLoading, router, user]);
  if (isLoading || !user) return <main className="flex min-h-screen items-center justify-center text-slate-600">Checking your session...</main>;
  return children;
}