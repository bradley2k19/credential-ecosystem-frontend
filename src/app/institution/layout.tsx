"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { AssetImage } from "@/components/AssetImage";
import { useAuth } from "@/context/AuthContext";
import { InstitutionProfileProvider, useInstitutionProfile } from "@/context/InstitutionProfileContext";

const navigation = [
  { label: "Overview", href: "/institution/dashboard" },
  { label: "Profile", href: "/institution/profile" },
  { label: "Templates", href: "/institution/templates" },
  { label: "Students", href: "/institution/students" },
  { label: "Certificates", href: "/institution/certificates" },
  { label: "Verification activity", href: "/institution/verifications" },
  { label: "Reports", href: "/institution/reports" },
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
  const isEditorRoute = /^\/institution\/templates\/[^/]+$/.test(pathname);

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen bg-slate-100 md:flex">
      <aside className="flex w-full shrink-0 flex-col border-b border-slate-200 bg-white p-5 md:sticky md:top-0 md:h-screen md:w-64 md:border-b-0 md:border-r">
        <Link className="block text-lg font-semibold text-slate-950" href="/institution/dashboard">
          {profile?.logoUrl
            ? <AssetImage alt={profile.name} className="max-h-10 w-auto max-w-full object-contain" path={profile.logoUrl} />
            : profile?.name ?? "Credential ecosystem"}
        </Link>
        <p className="mt-1 text-sm text-slate-500">Institution workspace</p>
        <nav aria-label="Institution navigation" className="mt-6 flex gap-2 overflow-x-auto md:flex-col">
          {navigation.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                aria-current={isActive ? "page" : undefined}
                className={`whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition ${isActive ? "bg-teal-50 text-teal-800" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"}`}
                href={item.href}
                key={item.href}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-200 pt-5 md:mt-auto md:block">
          <p className="min-w-0 break-all text-sm text-slate-600">{email}</p>
          <button
            className="mt-0 shrink-0 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 md:mt-3"
            onClick={handleLogout}
            type="button"
          >
            Log out
          </button>
        </div>
      </aside>
      {/* The template editor uses the full width and height (settings panel beside the preview). */}
      <main className={`min-w-0 flex-1 ${isEditorRoute ? "px-4 py-8 lg:px-4 lg:py-4" : "px-4 py-8 sm:px-6 lg:px-10"}`}>
        <div className={isEditorRoute ? "mx-auto max-w-5xl lg:max-w-none" : "mx-auto max-w-5xl"}>{children}</div>
      </main>
    </div>
  );
}
