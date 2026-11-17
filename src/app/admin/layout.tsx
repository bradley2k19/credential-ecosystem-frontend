"use client";

import { Building2, LayoutDashboard, ScrollText } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { AppShell, type ShellNavItem } from "@/components/AppShell";
import { useAuth } from "@/context/AuthContext";

const navigation: ShellNavItem[] = [
  { label: "Overview", href: "/admin/dashboard", icon: LayoutDashboard },
  { label: "Institutions", href: "/admin/institutions", icon: Building2 },
  { label: "Audit log", href: "/admin/audit-log", icon: ScrollText },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "admin")) router.replace("/login");
  }, [isLoading, router, user]);

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  if (isLoading || !user || user.role !== "admin") {
    return <main className="flex min-h-screen items-center justify-center text-slate-600">Checking your administrator session...</main>;
  }

  return (
    <AppShell
      brand={{ name: "Credential ecosystem" }}
      contentClassName="mx-auto max-w-6xl"
      email={user.email}
      homeHref="/admin/dashboard"
      items={navigation}
      navigationLabel="Administrator navigation"
      onLogout={handleLogout}
      workspaceLabel="Platform administration"
    >
      {children}
    </AppShell>
  );
}
