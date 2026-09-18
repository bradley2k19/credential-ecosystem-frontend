"use client";

import { useRouter } from "next/navigation";
import { useAuth, type UserRole } from "@/context/AuthContext";
import { InstitutionWalletPanel } from "@/components/InstitutionWalletPanel";

export function DashboardPage({ expectedRole }: { expectedRole: UserRole }) {
  const { user, logout } = useAuth(); const router = useRouter();
  if (!user) return null;
  function handleLogout() { logout(); router.replace("/login"); }
  return <main className="min-h-screen bg-slate-100 px-6 py-12"><section className="mx-auto max-w-3xl rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">{expectedRole} dashboard</p><h1 className="mt-3 text-3xl font-semibold text-slate-950">Logged in as {user.role}: {user.email}</h1></div><button className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={handleLogout} type="button">Log out</button></div>{expectedRole === "institution" && <InstitutionWalletPanel />}</section></main>;
}