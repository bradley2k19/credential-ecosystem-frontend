"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";

const navigation = [
  { label: "My certificates", href: "/student/dashboard", alsoActiveUnder: "/student/certificates" },
  { label: "Verification history", href: "/student/history" },
  { label: "Profile", href: "/student/profile" },
];

export default function StudentLayout({ children }: { children: ReactNode }) {
  const { user, isLoading, logout } = useAuth();
  const pathname = usePathname();
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
    <div className="min-h-screen bg-slate-100 md:flex">
      <aside className="flex w-full shrink-0 flex-col border-b border-slate-200 bg-white p-5 md:sticky md:top-0 md:h-screen md:w-64 md:border-b-0 md:border-r">
        <Link className="text-lg font-semibold text-slate-950" href="/student/dashboard">Credential ecosystem</Link>
        <p className="mt-1 text-sm text-slate-500">Student workspace</p>
        <nav aria-label="Student navigation" className="mt-6 flex gap-2 overflow-x-auto md:flex-col">
          {navigation.map((item) => {
            const isActive = pathname === item.href || Boolean(item.alsoActiveUnder && pathname.startsWith(item.alsoActiveUnder));
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
          <p className="min-w-0 break-all text-sm text-slate-600">{user.email}</p>
          <button className="mt-0 shrink-0 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 md:mt-3" onClick={handleLogout} type="button">
            Log out
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-8 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
