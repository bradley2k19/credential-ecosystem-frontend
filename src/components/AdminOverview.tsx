"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getAdminOverview, type AdminOverview as AdminOverviewData } from "@/lib/api";

export function AdminOverview() {
  const [overview, setOverview] = useState<AdminOverviewData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void getAdminOverview()
      .then((response) => { if (active) setOverview(response); })
      .catch((requestError: unknown) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "The overview could not be loaded.");
      });
    return () => { active = false; };
  }, []);

  return (
    <section>
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">Platform administration</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">Overview</h1>
        <p className="mt-2 text-slate-600">Platform-wide totals. Counts only; no personal data is shown here.</p>
      </div>

      {error && <p className="mt-6 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</p>}
      {!overview && !error && <p className="mt-6 text-sm text-slate-600">Loading overview...</p>}
      {overview && (
        <>
          <Link
            className={`mt-8 block rounded-lg border-2 p-5 transition hover:shadow-sm ${overview.institutions.awaitingVerification > 0 ? "border-amber-400 bg-amber-50 hover:bg-amber-100" : "border-slate-200 bg-slate-50 hover:bg-slate-100"}`}
            href="/admin/institutions?verified=false"
          >
            <p className="text-sm font-semibold text-slate-700">Institutions awaiting verification</p>
            <p className="mt-2 text-4xl font-semibold text-slate-950">{overview.institutions.awaitingVerification}</p>
            <p className="mt-2 text-sm font-semibold text-teal-700">
              {overview.institutions.awaitingVerification > 0 ? "Review unverified institutions →" : "View institutions →"}
            </p>
          </Link>

          <h2 className="mt-8 text-lg font-semibold text-slate-950">Institutions</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <SummaryCard label="Registered" value={overview.institutions.total} />
            <SummaryCard label="Verified" value={overview.institutions.verified} />
            <SummaryCard label="Students" value={overview.students.total} />
          </div>

          <h2 className="mt-8 text-lg font-semibold text-slate-950">Certificates and verifications</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard label="Certificates issued" value={overview.certificates.total} />
            <SummaryCard label="Active" value={overview.certificates.active} />
            <SummaryCard label="Revoked" value={overview.certificates.revoked} />
            <SummaryCard label="Verification checks" value={overview.verifications.total} />
          </div>
        </>
      )}
    </section>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}
