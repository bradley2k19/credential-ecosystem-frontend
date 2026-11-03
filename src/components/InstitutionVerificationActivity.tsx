"use client";

import { useEffect, useState } from "react";
import { getInstitutionVerifications, type InstitutionVerificationFilters, type InstitutionVerificationRecord } from "@/lib/api";
import { formatDateTime, verificationResultClasses, verificationResultLabels } from "@/lib/verification";

const PAGE_SIZE = 20;
const resultOptions = ["VALID", "REVOKED", "TAMPERED", "PENDING_CHAIN"];
const emptyFilters: InstitutionVerificationFilters = { result: "", from: "", to: "" };

function shortenUid(uid: string) {
  return uid.length > 8 ? `${uid.slice(0, 8)}…` : uid;
}

export function InstitutionVerificationActivity() {
  const [records, setRecords] = useState<InstitutionVerificationRecord[]>([]);
  const [filters, setFilters] = useState<InstitutionVerificationFilters>(emptyFilters);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void getInstitutionVerifications(page, PAGE_SIZE, filters)
      .then((response) => {
        if (!active) return;
        setRecords(response.verifications);
        setTotalPages(Math.max(response.pagination.totalPages, 1));
      })
      .catch((requestError: unknown) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "Verification activity could not be loaded.");
      })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [filters, page]);

  function startLoading() {
    setIsLoading(true);
    setError("");
  }

  function changePage(nextPage: number) {
    startLoading();
    setPage(nextPage);
  }

  // Any filter change starts again from the first page.
  function updateFilter(field: keyof InstitutionVerificationFilters, value: string) {
    startLoading();
    setFilters((current) => ({ ...current, [field]: value }));
    setPage(1);
  }

  function clearFilters() {
    startLoading();
    setFilters(emptyFilters);
    setPage(1);
  }

  const hasFilters = Boolean(filters.result || filters.from || filters.to);

  return (
    <section>
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">Institution workspace</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">Verification activity</h1>
        <p className="mt-2 text-slate-600">Every check of a certificate your institution issued, most recent first.</p>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <label className="block text-sm font-medium text-slate-700" htmlFor="activity-result">
          Result
          <select className="field" id="activity-result" onChange={(event) => updateFilter("result", event.target.value)} value={filters.result}>
            <option value="">All</option>
            {resultOptions.map((result) => <option key={result} value={result}>{verificationResultLabels[result]}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-700" htmlFor="activity-from">
          From
          <input className="field" id="activity-from" max={filters.to || undefined} onChange={(event) => updateFilter("from", event.target.value)} type="date" value={filters.from} />
        </label>
        <label className="block text-sm font-medium text-slate-700" htmlFor="activity-to">
          To
          <input className="field" id="activity-to" min={filters.from || undefined} onChange={(event) => updateFilter("to", event.target.value)} type="date" value={filters.to} />
        </label>
        <button className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50" disabled={!hasFilters} onClick={clearFilters} type="button">Clear</button>
      </div>

      {error && <p className="mt-6 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</p>}
      {isLoading ? (
        <p className="mt-6 text-sm text-slate-600">Loading verification activity...</p>
      ) : error ? null : records.length === 0 ? (
        <p className="mt-6 rounded-md bg-slate-50 p-5 text-sm text-slate-600 ring-1 ring-slate-200">
          {hasFilters ? "No results match these filters." : "Nobody has verified your certificates yet."}
        </p>
      ) : (
        <>
          <div className="mt-6 overflow-x-auto rounded-md border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Date and time</th>
                  <th className="px-4 py-3 font-semibold">Certificate</th>
                  <th className="px-4 py-3 font-semibold">Student</th>
                  <th className="px-4 py-3 font-semibold">Result</th>
                  <th className="px-4 py-3 font-semibold">Method</th>
                  <th className="px-4 py-3 font-semibold">Verified by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {records.map((record) => (
                  <tr key={record.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDateTime(record.verifiedAt)}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {record.certificate?.certificateType ?? "Certificate"}
                      {record.certificate && (
                        <span className="block font-mono text-xs font-normal text-slate-500" title={record.certificate.certificateUid}>{shortenUid(record.certificate.certificateUid)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {record.student?.fullName ?? "Unknown student"}
                      {record.student && <span className="block text-xs text-slate-500">{record.student.studentNumber}</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${verificationResultClasses[record.result] ?? "bg-slate-100 text-slate-700"}`}>{verificationResultLabels[record.result] ?? record.result}</span></td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">{record.method === "QR" ? "QR" : "Manual"}</td>
                    <td className="px-4 py-3 text-slate-700">{record.verifiedBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between gap-4 text-sm text-slate-600">
            <span>Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <button className="rounded-md border border-slate-300 px-3 py-2 font-medium hover:bg-white disabled:opacity-50" disabled={page <= 1} onClick={() => changePage(page - 1)} type="button">Previous</button>
              <button className="rounded-md border border-slate-300 px-3 py-2 font-medium hover:bg-white disabled:opacity-50" disabled={page >= totalPages} onClick={() => changePage(page + 1)} type="button">Next</button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
