"use client";

import { useEffect, useState } from "react";
import { getEmployerVerificationHistory, type EmployerVerificationRecord } from "@/lib/api";

const PAGE_SIZE = 20;

const resultLabels: Record<string, string> = {
  VALID: "Valid",
  REVOKED: "Revoked",
  NOT_FOUND: "Not found",
  TAMPERED: "Tampered",
  PENDING_CHAIN: "Pending chain",
};

const resultClasses: Record<string, string> = {
  VALID: "bg-emerald-100 text-emerald-800",
  REVOKED: "bg-amber-100 text-amber-900",
  NOT_FOUND: "bg-slate-100 text-slate-700",
  TAMPERED: "bg-red-100 text-red-900",
  PENDING_CHAIN: "bg-sky-100 text-sky-900",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function EmployerVerificationHistory() {
  const [records, setRecords] = useState<EmployerVerificationRecord[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void getEmployerVerificationHistory(page, PAGE_SIZE)
      .then((response) => {
        if (!active) return;
        setRecords(response.verifications);
        setTotalPages(Math.max(response.pagination.totalPages, 1));
      })
      .catch((requestError: unknown) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "History could not be loaded.");
      })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [page]);

  function changePage(nextPage: number) {
    setIsLoading(true);
    setError("");
    setPage(nextPage);
  }

  return (
    <section>
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">Record keeping</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">Verification history</h1>
        <p className="mt-2 text-slate-600">Your most recent certificate checks appear first.</p>
      </div>

      {error && <p className="mt-6 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</p>}
      {isLoading ? (
        <p className="mt-6 text-sm text-slate-600">Loading verification history...</p>
      ) : records.length === 0 ? (
        <p className="mt-6 rounded-md bg-white p-5 text-sm text-slate-600 ring-1 ring-slate-200">No verification history yet. Checks you make will appear here.</p>
      ) : (
        <>
          <div className="mt-6 overflow-x-auto rounded-md border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-600">
                <tr><th className="px-4 py-3 font-semibold">Certificate UID queried</th><th className="px-4 py-3 font-semibold">Result</th><th className="px-4 py-3 font-semibold">Checked at</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {records.map((record) => (
                  <tr key={record.id}>
                    <td className="max-w-xs break-all px-4 py-3 font-mono text-xs text-slate-800">{record.certificateUidQueried}</td>
                    <td className="whitespace-nowrap px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${resultClasses[record.result] ?? "bg-slate-100 text-slate-700"}`}>{resultLabels[record.result] ?? record.result}</span></td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(record.verifiedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between gap-4 text-sm text-slate-600">
            <span>Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <button className="rounded-md border border-slate-300 px-3 py-2 font-medium hover:bg-white disabled:opacity-50" disabled={page <= 1 || isLoading} onClick={() => changePage(page - 1)} type="button">Previous</button>
              <button className="rounded-md border border-slate-300 px-3 py-2 font-medium hover:bg-white disabled:opacity-50" disabled={page >= totalPages || isLoading} onClick={() => changePage(page + 1)} type="button">Next</button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}