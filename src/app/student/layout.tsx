"use client";

import { Award, History, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { AppShell, type ShellNavItem } from "@/components/AppShell";
import { useAuth } from "@/context/AuthContext";

const navigation: ShellNavItem[] = [
  { label: "My certificates", href: "/student/dashboard", icon: Award, activeUnder: ["/student/certificates"] },
  { label: "Verification history", href: "/student/history", icon: History },
  { label: "Profile", href: "/student/profile", icon: UserRound },
];

export default function StudentLayout({ children }: { children: ReactNode }) {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "student")) router.replace("/login");
  }, [isLoading, router, user]);

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  if (isLoading || !user || user.role !== "student") {
    return <main className="flex min-h-screen items-center justify-center text-slate-600">Checking your student session...</main>;
  }

  return (
    <AppShell
      brand={{ name: "Credential ecosystem" }}
      email={user.email}
      homeHref="/student/dashboard"
      items={navigation}
      navigationLabel="Student navigation"
      onLogout={handleLogout}
      workspaceLabel="Student workspace"
    >
      {children}
    </AppShell>
  );
}
