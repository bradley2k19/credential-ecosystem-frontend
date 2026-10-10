import Link from "next/link";
import type { ReactNode } from "react";

// Public pages: no sidebar and no session requirement, so anyone scanning a QR code can use them.
export default function PublicVerifyLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">Credential ecosystem</p>
        <section className="mt-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">{children}</section>
        <p className="mt-6 text-center text-sm text-slate-600">
          Have an account? <Link className="font-semibold text-teal-700 hover:text-teal-900" href="/login">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
