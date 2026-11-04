"use client";

import { useEffect, useState } from "react";
import { getAdminAuditLogs, type AdminAuditLog as AdminAuditLogEntry } from "@/lib/api";
import { EXPLORER_TX_URL } from "@/lib/onChain";
import { formatDateTime } from "@/lib/verification";

const PAGE_SIZE = 20;

const actionLabels: Record<string, string> = {
  INSTITUTION_VERIFIED: "Institution verified",
  INSTITUTION_UNVERIFIED: "Institution unverified",
  ISSUER_GRANTED: "Issuer access granted",
  ISSUER_REVOKED: "Issuer access revoked",
};

const outcomeClasses: Record<string, string> = {
  CONFIRMED: "bg-emerald-100 text-emerald-800",
  PENDING: "bg-amber-100 text-amber-900",
  FAILED: "bg-red-100 text-red-900",
};

export function AdminAuditLog() {
  const [entries, setEntries] = useState<AdminAuditLogEntry[]>([]);
  const [actionFilter, setActionFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void getAdminAuditLogs(page, PAGE_SIZE, actionFilter)
      .then((response) => {
        if (!active) return;
        setEntries(response.auditLogs);
        setTotalPages(Math.max(response.pagination.totalPages, 1));
      })
      .catch((requestError: unknown) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "The audit log could not be loaded.");
      })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [actionFilter, page]);

  function startLoading() {
    setIsLoading(true);
    setError("");
  }

  function changePage(nextPage: number) {
    startLoading();
    setPage(nextPage);
  }

  function changeAction(action: string) {
    startLoading();
    setActionFilter(action);
    setPage(1);
  }

  return (
    <section>
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">Platform administration</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">Audit log</h1>
        <p className="mt-2 text-slate-600">Every administrator action, most recent first.</p>
      </div>

      <label className="mt-6 block max-w-xs text-sm font-medium text-slate-700" htmlFor="audit-action">
        Action
        <select className="field" id="audit-action" onChange={(event) => changeAction(event.target.value)} value={actionFilter}>
          <option value="">All actions</option>
          {Object.entries(actionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>

      {error && <p className="mt-6 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</p>}
      {isLoading ? (
        <p className="mt-6 text-sm text-slate-600">Loading audit log...</p>
      ) : error ? null : entries.length === 0 ? (
        <p className="mt-6 rounded-md bg-slate-50 p-5 text-sm text-slate-600 ring-1 ring-slate-200">
          {actionFilter ? "No actions match this filter." : "No admin actions recorded yet."}
        </p>
      ) : (
        <>
          <div className="mt-6 overflow-x-auto rounded-md border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Time</th>
                  <th className="px-4 py-3 font-semibold">Admin</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                  <th className="px-4 py-3 font-semibold">Institution</th>
                  <th className="px-4 py-3 font-semibold">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {entries.map((entry) => (
                  <tr className="align-top" key={entry.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDateTime(entry.createdAt)}</td>
                    <td className="break-all px-4 py-3 text-slate-700">{entry.adminEmail ?? "Unknown"}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">{actionLabels[entry.action] ?? entry.action}</td>
                    <td className="px-4 py-3 text-slate-700">{entry.institution.name ?? "Unknown institution"}</td>
                    <td className="px-4 py-3 text-slate-700"><AuditDetails entry={entry} /></td>
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

function AuditDetails({ entry }: { entry: AdminAuditLogEntry }) {
  const { outcome, transactionHash, failure } = entry.details;
  if (!outcome && !transactionHash) return <span className="text-slate-400">—</span>;

  return (
    <div className="space-y-1">
      {typeof outcome === "string" && (
        <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${outcomeClasses[outcome] ?? "bg-slate-100 text-slate-700"}`}>
          {outcome.charAt(0) + outcome.slice(1).toLowerCase()}
        </span>
      )}
      {typeof transactionHash === "string" && transactionHash && (
        <a className="block font-mono text-xs font-semibold text-teal-700 underline" href={`${EXPLORER_TX_URL}${transactionHash}`} rel="noreferrer" target="_blank" title={transactionHash}>
          {`${transactionHash.slice(0, 10)}…${transactionHash.slice(-6)}`}
        </a>
      )}
      {typeof failure === "string" && failure && <p className="text-xs text-red-800">{failure}</p>}
    </div>
  );
}
