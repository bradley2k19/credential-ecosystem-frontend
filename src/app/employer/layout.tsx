"use client";

import { History, ScanSearch } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { AppShell, type ShellNavItem } from "@/components/AppShell";
import { useAuth } from "@/context/AuthContext";

const navigation: ShellNavItem[] = [
  { label: "Verify", href: "/employer/dashboard", icon: ScanSearch },
  { label: "History", href: "/employer/history", icon: History },
];

export default function EmployerLayout({ children }: { children: ReactNode }) {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "employer")) router.replace("/login");
  }, [isLoading, router, user]);

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  if (isLoading || !user || user.role !== "employer") {
    return <main className="flex min-h-screen items-center justify-center text-slate-600">Checking your employer session...</main>;
  }

  return (
    <AppShell
      brand={{ name: "Credential ecosystem" }}
      email={user.email}
      homeHref="/employer/dashboard"
      items={navigation}
      navigationLabel="Employer navigation"
      onLogout={handleLogout}
      workspaceLabel="Employer workspace"
    >
      {children}
    </AppShell>
  );
}
