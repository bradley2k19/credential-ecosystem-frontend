"use client";

import { Award, Bell, FilePenLine, History, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { AppShell, type ShellNavItem } from "@/components/AppShell";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { useAuth } from "@/context/AuthContext";
import { unreadNotifications } from "@/lib/liveCounts";

export default function StudentLayout({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "student")) router.replace("/login");
  }, [isLoading, router, user]);

  if (isLoading || !user || user.role !== "student") {
    return <main className="flex min-h-screen items-center justify-center text-slate-600">Checking your student session...</main>;
  }

  // The live counts are only read (and polled) once the session is confirmed to be a student's.
  return <StudentShell email={user.email}>{children}</StudentShell>;
}

function StudentShell({ email, children }: { email: string; children: ReactNode }) {
  const { logout } = useAuth();
  const router = useRouter();
  const unread = unreadNotifications.useCount();

  const navigation: ShellNavItem[] = [
    { label: "My certificates", href: "/student/dashboard", icon: Award, activeUnder: ["/student/certificates"] },
    { label: "Corrections", href: "/student/corrections", icon: FilePenLine },
    { label: "Notifications", href: "/student/notifications", icon: Bell, badge: unread, badgeLabel: "unread" },
    { label: "Verification history", href: "/student/history", icon: History },
    { label: "Profile", href: "/student/profile", icon: UserRound },
  ];

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  return (
    <AppShell
      brand={{ name: "Credential ecosystem" }}
      email={email}
      homeHref="/student/dashboard"
      items={navigation}
      navigationLabel="Student navigation"
      onLogout={handleLogout}
      toolbar={(placement) => <NotificationBell placement={placement} role="student" />}
      workspaceLabel="Student workspace"
    >
      {children}
    </AppShell>
  );
}
