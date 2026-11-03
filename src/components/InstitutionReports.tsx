"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  downloadInstitutionCertificatesCsv,
  getInstitutionReportSummary,
  type CertificateExportFilters,
  type InstitutionReportSummary,
} from "@/lib/api";
import { verificationResultClasses, verificationResultLabels } from "@/lib/verification";

const resultOrder = ["VALID", "REVOKED", "TAMPERED", "PENDING_CHAIN"] as const;

/** Today's date in the browser's time zone as YYYY-MM-DD, for the download file name. */
function localDateStamp() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function InstitutionReports() {
  const [summary, setSummary] = useState<InstitutionReportSummary | null>(null);
  const [summaryError, setSummaryError] = useState("");
  const [exportFilters, setExportFilters] = useState<CertificateExportFilters>({ status: "", from: "", to: "" });
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  useEffect(() => {
    let active = true;
    void getInstitutionReportSummary()
      .then((response) => { if (active) setSummary(response); })
      .catch((requestError: unknown) => {
        if (active) setSummaryError(requestError instanceof Error ? requestError.message : "The summary could not be loaded.");
      });
    return () => { active = false; };
  }, []);

  async function handleDownload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsDownloading(true);
    setDownloadError("");
    try {
      const blob = await downloadInstitutionCertificatesCsv(exportFilters);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `certificates-${localDateStamp()}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setDownloadError(requestError instanceof Error ? requestError.message : "The export could not be downloaded.");
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <section>
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">Institution workspace</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">Reports</h1>
        <p className="mt-2 text-slate-600">A summary of the certificates you issued and how often they were verified.</p>
      </div>

      {summaryError && <p className="mt-6 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{summaryError}</p>}
      {!summary && !summaryError && <p className="mt-6 text-sm text-slate-600">Loading summary...</p>}
      {summary && (
        <>
          <h2 className="mt-8 text-lg font-semibold text-slate-950">Certificates</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <SummaryCard label="Certificates issued" value={summary.certificates.total} />
            <SummaryCard label="Active" value={summary.certificates.active} />
            <SummaryCard label="Revoked" value={summary.certificates.revoked} />
            <SummaryCard label="Confirmed on-chain" value={summary.certificates.issueConfirmed} />
            <SummaryCard
              hint="Issuance missing or failed on-chain"
              label="Needing attention"
              tone={summary.certificates.issueMissingOrFailed > 0 ? "warning" : "default"}
              value={summary.certificates.issueMissingOrFailed}
            />
            {summary.certificates.issuePending > 0 && <SummaryCard hint="Issuance awaiting confirmation" label="Pending on-chain" value={summary.certificates.issuePending} />}
          </div>

          <h2 className="mt-8 text-lg font-semibold text-slate-950">Verifications</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <SummaryCard label="Verifications in total" value={summary.verifications.total} />
            <SummaryCard label="Last 30 days" value={summary.verifications.last30Days} />
            <div className="rounded-md border border-slate-200 bg-white p-4">
              <p className="text-sm font-medium text-slate-600">By result</p>
              <ul className="mt-3 space-y-2 text-sm">
                {resultOrder.map((result) => (
                  <li className="flex items-center justify-between gap-3" key={result}>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${verificationResultClasses[result]}`}>{verificationResultLabels[result]}</span>
                    <span className="font-semibold text-slate-900">{summary.verifications.byResult[result] ?? 0}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}

      <div className="mt-10 border-t border-slate-200 pt-6">
        <h2 className="text-lg font-semibold text-slate-950">Download certificates (CSV)</h2>
        <p className="mt-1 text-sm text-slate-600">Every certificate you issued, optionally filtered by status and issue date. Up to 10,000 rows.</p>
        <form className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end" onSubmit={handleDownload}>
          <label className="block text-sm font-medium text-slate-700" htmlFor="export-status">
            Status
            <select
              className="field"
              id="export-status"
              onChange={(event) => setExportFilters((current) => ({ ...current, status: event.target.value as CertificateExportFilters["status"] }))}
              value={exportFilters.status}
            >
              <option value="">All</option>
              <option value="ACTIVE">Active</option>
              <option value="REVOKED">Revoked</option>
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700" htmlFor="export-from">
            Issued from
            <input className="field" id="export-from" max={exportFilters.to || undefined} onChange={(event) => setExportFilters((current) => ({ ...current, from: event.target.value }))} type="date" value={exportFilters.from} />
          </label>
          <label className="block text-sm font-medium text-slate-700" htmlFor="export-to">
            Issued to
            <input className="field" id="export-to" min={exportFilters.from || undefined} onChange={(event) => setExportFilters((current) => ({ ...current, to: event.target.value }))} type="date" value={exportFilters.to} />
          </label>
          <button className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60" disabled={isDownloading} type="submit">
            {isDownloading ? "Preparing download..." : "Download CSV"}
          </button>
        </form>
        {downloadError && <p className="mt-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{downloadError}</p>}
      </div>
    </section>
  );
}

function SummaryCard({ label, value, hint, tone = "default" }: { label: string; value: number; hint?: string; tone?: "default" | "warning" }) {
  return (
    <div className={`rounded-md border p-4 ${tone === "warning" ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"}`}>
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-950">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
