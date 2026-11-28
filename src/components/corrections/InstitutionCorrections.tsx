"use client";

import Link from "next/link";
import { useEffect, useId, useState, type FormEvent } from "react";
import { ScaledCertificate } from "@/components/certificate/ScaledCertificate";
import { CorrectionStageBadge } from "@/components/corrections/CorrectionStageBadge";
import { Modal } from "@/components/Modal";
import {
  approveCorrectionRequest,
  getInstitutionCertificate,
  getInstitutionCorrectionRequest,
  getInstitutionCorrectionRequests,
  rejectCorrectionRequest,
  type InstitutionCertificateDetail,
  type InstitutionCorrectionRequest,
} from "@/lib/api";
import { renderDataFromCertificate } from "@/lib/certificateDesign";
import { pendingCorrections } from "@/lib/liveCounts";
import { formatCertificateDate } from "@/lib/verification";

type StatusFilter = "" | "pending" | "approved" | "rejected";
const PAGE_SIZE = 20;

/** The institution's correction requests, filtered by status, each opening a detail view with the decision. */
export function InstitutionCorrections({ initialRequestId }: { initialRequestId?: string }) {
  const [status, setStatus] = useState<StatusFilter>("pending");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<InstitutionCorrectionRequest[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [pendingCount, setPendingCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [openId, setOpenId] = useState(initialRequestId ?? "");

  useEffect(() => {
    let active = true;
    void getInstitutionCorrectionRequests({ status, page, limit: PAGE_SIZE })
      .then((response) => {
        if (!active) return;
        setRows(response.correctionRequests);
        setTotalPages(Math.max(response.pagination.totalPages, 1));
        setPendingCount(response.pendingCount);
        pendingCorrections.set(response.pendingCount);
      })
      .catch((loadError: unknown) => { if (active) setError(loadError instanceof Error ? loadError.message : "Correction requests could not be loaded."); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [status, page, reloadKey]);

  function reload(changes: { status?: StatusFilter; page?: number } = {}) {
    setIsLoading(true);
    setError("");
    if (changes.status !== undefined) setStatus(changes.status);
    if (changes.page !== undefined) setPage(changes.page);
    setReloadKey((key) => key + 1);
  }

  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">Institution workspace</p>
      <h1 className="mt-2 text-3xl font-semibold text-slate-950">Correction requests</h1>
      <p className="mt-2 max-w-3xl text-slate-600">
        Issued certificates never change. To correct one, approve the request, issue a corrected certificate, then revoke the original.
        {pendingCount > 0 ? ` ${pendingCount} waiting for a decision.` : ""}
      </p>

      <label className="mt-6 block max-w-xs text-sm font-medium text-slate-700" htmlFor="correction-status">
        Status
        <select className="field" id="correction-status" onChange={(event) => reload({ status: event.target.value as StatusFilter, page: 1 })} value={status}>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="">All</option>
        </select>
      </label>

      {error && <p className="mt-6 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</p>}
      {isLoading ? (
        <p className="mt-6 text-sm text-slate-600" role="status">Loading correction requests...</p>
      ) : rows.length === 0 ? (
        <p className="mt-6 rounded-md bg-slate-50 p-6 text-center text-sm text-slate-600" data-corrections-empty="">
          {status === "pending" ? "No correction requests are waiting for a decision." : "No correction requests match this filter."}
        </p>
      ) : (
        <>
          <div className="mt-6 overflow-x-auto rounded-md border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm" data-corrections-table="">
              <thead className="bg-slate-50 text-xs uppercase text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Requested</th>
                  <th className="px-4 py-3 font-semibold">Student</th>
                  <th className="px-4 py-3 font-semibold">Certificate</th>
                  <th className="px-4 py-3 font-semibold">Stage</th>
                  <th className="px-4 py-3 font-semibold"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {rows.map((row) => (
                  <tr data-correction-row={row.id} key={row.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">{formatCertificateDate(row.requestedAt)}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{row.student.fullName}<span className="block text-xs font-normal text-slate-500">{row.student.studentNumber}</span></td>
                    <td className="px-4 py-3 text-slate-700">{row.certificate.certificateType}<span className="block text-xs text-slate-500">{row.certificate.programName}</span></td>
                    <td className="px-4 py-3"><CorrectionStageBadge audience="institution" stage={row.stage} /></td>
                    <td className="px-4 py-3 text-right">
                      <button className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50" onClick={() => setOpenId(row.id)} type="button">Open</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between gap-4 text-sm text-slate-600">
            <span>Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <button className="rounded-md border border-slate-300 px-3 py-2 font-medium hover:bg-slate-50 disabled:opacity-50" disabled={page <= 1} onClick={() => reload({ page: page - 1 })} type="button">Previous</button>
              <button className="rounded-md border border-slate-300 px-3 py-2 font-medium hover:bg-slate-50 disabled:opacity-50" disabled={page >= totalPages} onClick={() => reload({ page: page + 1 })} type="button">Next</button>
            </div>
          </div>
        </>
      )}

      {openId && <CorrectionDetailDialog onChanged={() => reload()} onClose={() => setOpenId("")} requestId={openId} />}
    </section>
  );
}

type Decision = "approve" | "reject";

/** One request: its text, the student, the original certificate drawn as issued, and the next step. */
function CorrectionDetailDialog({ requestId, onClose, onChanged }: { requestId: string; onClose: () => void; onChanged: () => void }) {
  const noteId = useId();
  const [request, setRequest] = useState<InstitutionCorrectionRequest | null>(null);
  const [original, setOriginal] = useState<InstitutionCertificateDetail | null>(null);
  const [loadError, setLoadError] = useState("");
  const [decision, setDecision] = useState<Decision | null>(null);
  const [note, setNote] = useState("");
  const [decisionError, setDecisionError] = useState("");
  const [isDeciding, setIsDeciding] = useState(false);

  useEffect(() => {
    let active = true;
    void getInstitutionCorrectionRequest(requestId)
      .then(async (loaded) => {
        if (!active) return;
        setRequest(loaded);
        const certificate = await getInstitutionCertificate(loaded.certificate.id);
        if (active) setOriginal(certificate);
      })
      .catch((error: unknown) => { if (active) setLoadError(error instanceof Error ? error.message : "This correction request could not be loaded."); });
    return () => { active = false; };
  }, [requestId]);

  async function confirmDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!request || !decision) return;
    if (decision === "reject" && !note.trim()) {
      setDecisionError("Add a note explaining why the request is rejected. The student will see it.");
      return;
    }
    setIsDeciding(true);
    setDecisionError("");
    try {
      const updated = decision === "approve" ? await approveCorrectionRequest(request.id, note.trim() || undefined) : await rejectCorrectionRequest(request.id, note.trim());
      setRequest(updated);
      setDecision(null);
      setNote("");
      onChanged();
      void pendingCorrections.refresh();
    } catch (error) {
      setDecisionError(error instanceof Error ? error.message : "The decision could not be saved.");
    } finally {
      setIsDeciding(false);
    }
  }

  return (
    <Modal isBusy={isDeciding} onClose={onClose} size="xl" testId="correction-detail" title="Correction request">
      {loadError ? (
        <p className="mt-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{loadError}</p>
      ) : !request ? (
        <p className="mt-4 text-sm text-slate-600" role="status">Loading the request...</p>
      ) : (
        <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div className="space-y-4 text-sm text-slate-700">
            <div className="flex flex-wrap items-center gap-2">
              <CorrectionStageBadge audience="institution" stage={request.stage} />
              <span className="text-xs text-slate-500">Requested on {formatCertificateDate(request.requestedAt)}</span>
            </div>
            <dl className="grid gap-3">
              <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Student</dt><dd className="mt-0.5 font-medium text-slate-900">{request.student.fullName} ({request.student.studentNumber})</dd></div>
              <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Certificate</dt><dd className="mt-0.5">{request.certificate.certificateType}, {request.certificate.programName}<span className="block break-all font-mono text-xs text-slate-500">{request.certificate.certificateUid}</span></dd></div>
              <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">What the student asks</dt><dd className="mt-0.5 whitespace-pre-line break-words rounded-md bg-slate-50 px-3 py-2 text-slate-900" data-request-text="">{request.requestDetails}</dd></div>
              {request.resolutionNote && <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Your note</dt><dd className="mt-0.5">{request.resolutionNote}</dd></div>}
            </dl>

            {request.stage === "pending" && !decision && (
              <div className="flex flex-wrap gap-2">
                <button className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800" onClick={() => setDecision("approve")} type="button">Approve</button>
                <button className="rounded-md border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50" onClick={() => setDecision("reject")} type="button">Reject</button>
              </div>
            )}

            {request.stage === "pending" && decision && (
              <form className="space-y-3 rounded-md border border-slate-200 p-4" data-decision-form={decision} noValidate onSubmit={confirmDecision}>
                <p className="font-semibold text-slate-900">{decision === "approve" ? "Approve this request?" : "Reject this request?"}</p>
                <p className="text-xs leading-5 text-slate-600">
                  {decision === "approve"
                    ? "Approving changes nothing on the certificate. Next you issue a corrected certificate and then revoke the original."
                    : "The student is told the request was rejected, with your note."}
                </p>
                <label className="block text-sm font-medium text-slate-700" htmlFor={noteId}>
                  {decision === "approve" ? "Note to the student (optional)" : "Note to the student (required)"}
                  <textarea className="field min-h-20" id={noteId} maxLength={1000} onChange={(event) => { setNote(event.target.value); setDecisionError(""); }} value={note} />
                </label>
                {decisionError && <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{decisionError}</p>}
                <div className="flex gap-2">
                  <button className={`rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${decision === "approve" ? "bg-teal-700 hover:bg-teal-800" : "bg-red-700 hover:bg-red-800"}`} disabled={isDeciding} type="submit">
                    {isDeciding ? "Saving..." : decision === "approve" ? "Confirm approval" : "Confirm rejection"}
                  </button>
                  <button className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" disabled={isDeciding} onClick={() => { setDecision(null); setDecisionError(""); }} type="button">Back</button>
                </div>
              </form>
            )}

            {request.stage === "approved_awaiting_reissue" && (
              <Link className="inline-block rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800" data-reissue-link="" href={`/institution/certificates?correct=${encodeURIComponent(request.id)}`}>
                Reissue corrected certificate
              </Link>
            )}
            {request.stage === "replacement_issued" && (
              <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-950">
                <p>The corrected certificate <span className="break-all font-mono text-xs">{request.replacement?.certificateUid}</span> is issued. Now revoke the original.</p>
                <Link className="inline-block rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800" href={`/institution/certificates?correct=${encodeURIComponent(request.id)}`}>Revoke the original certificate</Link>
              </div>
            )}
            {request.stage === "completed" && <p className="rounded-md bg-emerald-50 px-3 py-2 text-emerald-800">Completed: the corrected certificate is issued and the original is revoked.</p>}
          </div>

          <div className="rounded-md bg-slate-100 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">The original certificate, as issued</p>
            {original ? (
              <ScaledCertificate data={renderDataFromCertificate(original)} snapshot={original.renderSnapshot} />
            ) : (
              <p className="py-10 text-center text-sm text-slate-500" role="status">Loading the certificate...</p>
            )}
          </div>
        </div>
      )}
      <div className="mt-6 flex justify-end">
        <button className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" disabled={isDeciding} onClick={onClose} type="button">Close</button>
      </div>
    </Modal>
  );
}
