"use client";

import { Award, Building2, ChartColumn, GraduationCap, LayoutDashboard, LayoutTemplate, ShieldCheck } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { AppShell, type ShellNavItem } from "@/components/AppShell";
import { useAuth } from "@/context/AuthContext";
import { InstitutionProfileProvider, useInstitutionProfile } from "@/context/InstitutionProfileContext";

const navigation: ShellNavItem[] = [
  { label: "Overview", href: "/institution/dashboard", icon: LayoutDashboard },
  { label: "Profile", href: "/institution/profile", icon: Building2 },
  { label: "Templates", href: "/institution/templates", icon: LayoutTemplate },
  { label: "Students", href: "/institution/students", icon: GraduationCap },
  { label: "Certificates", href: "/institution/certificates", icon: Award },
  { label: "Verification activity", href: "/institution/verifications", icon: ShieldCheck },
  { label: "Reports", href: "/institution/reports", icon: ChartColumn },
];

export default function InstitutionLayout({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "institution")) router.replace("/login");
  }, [isLoading, router, user]);

  if (isLoading || !user || user.role !== "institution") {
    return <main className="flex min-h-screen items-center justify-center text-slate-600">Checking your institution session...</main>;
  }

  // The profile is only fetched once the session is confirmed to be an institution.
  return (
    <InstitutionProfileProvider>
      <InstitutionShell email={user.email}>{children}</InstitutionShell>
    </InstitutionProfileProvider>
  );
}

function InstitutionShell({ email, children }: { email: string; children: ReactNode }) {
  const { logout } = useAuth();
  const { profile } = useInstitutionProfile();
  const pathname = usePathname();
  const router = useRouter();
  // The template editor (/institution/templates/new and /institution/templates/<id>) needs the whole width:
  // it shows the sidebar as the icon rail and fills the window below its own top bar.
  const isEditorRoute = /^\/institution\/templates\/[^/]+$/.test(pathname);

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  return (
    <AppShell
      brand={{ name: profile?.name ?? "Credential ecosystem", logoPath: profile?.logoUrl }}
      contentClassName={isEditorRoute ? "mx-auto max-w-5xl lg:max-w-none" : undefined}
      email={email}
      forceRail={isEditorRoute}
      homeHref="/institution/dashboard"
      items={navigation}
      mainClassName={isEditorRoute ? "min-w-0 flex-1 px-4 py-8 lg:p-4" : undefined}
      navigationLabel="Institution navigation"
      onLogout={handleLogout}
      workspaceLabel="Institution workspace"
    >
      {children}
    </AppShell>
  );
}
