"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CorrectionStageBadge } from "@/components/corrections/CorrectionStageBadge";
import { getStudentCorrectionRequests, type CorrectionRequest } from "@/lib/api";
import { formatCertificateDate } from "@/lib/verification";

/** The student's correction requests, newest first, with their stage, the institution's note and any replacement. */
export function StudentCorrections({ highlightId }: { highlightId?: string }) {
  const [requests, setRequests] = useState<CorrectionRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void getStudentCorrectionRequests()
      .then((response) => { if (active) setRequests(response.correctionRequests); })
      .catch((loadError: unknown) => { if (active) setError(loadError instanceof Error ? loadError.message : "Your correction requests could not be loaded."); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (highlightId && !isLoading) document.getElementById(`correction-${highlightId}`)?.scrollIntoView({ block: "center" });
  }, [highlightId, isLoading]);

  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">Student workspace</p>
      <h1 className="mt-2 text-3xl font-semibold text-slate-950">Corrections</h1>
      <p className="mt-2 max-w-3xl text-slate-600">
        Issued certificates never change. When your institution approves a correction, it issues a corrected certificate and then revokes the original.
        To ask for one, open the certificate and choose &ldquo;Request a correction&rdquo;.
      </p>

      {error && <p className="mt-6 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</p>}
      {isLoading ? (
        <p className="mt-6 text-sm text-slate-600" role="status">Loading your correction requests...</p>
      ) : requests.length === 0 ? (
        <p className="mt-6 rounded-md bg-slate-50 p-6 text-center text-sm text-slate-600" data-corrections-empty="">
          You have not requested any corrections. <Link className="font-semibold text-teal-700 underline" href="/student/dashboard">Go to my certificates</Link>
        </p>
      ) : (
        <ul className="mt-6 space-y-4" data-corrections-list="">
          {requests.map((request) => (
            <li
              className={`rounded-md border p-5 ${request.id === highlightId ? "border-teal-500 ring-2 ring-teal-200" : "border-slate-200"}`}
              data-correction-request={request.id}
              id={`correction-${request.id}`}
              key={request.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-950">{request.certificate.certificateType} <span className="font-normal text-slate-600">({request.certificate.programName})</span></p>
                  <p className="mt-0.5 text-xs text-slate-500">Requested on {formatCertificateDate(request.requestedAt)}{request.resolvedAt ? ` · decided on ${formatCertificateDate(request.resolvedAt)}` : ""}</p>
                </div>
                <CorrectionStageBadge audience="student" stage={request.stage} />
              </div>
              <p className="mt-3 whitespace-pre-line break-words text-sm text-slate-700">{request.requestDetails}</p>
              {request.resolutionNote && (
                <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700"><span className="font-semibold">Note from the institution: </span>{request.resolutionNote}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <Link className="font-semibold text-teal-700 hover:text-teal-900" href={`/student/certificates/${request.certificate.id}`}>
                  {request.replacement ? "Original certificate" : "View the certificate"}
                </Link>
                {request.replacement && (
                  <Link className="font-semibold text-teal-700 hover:text-teal-900" href={`/student/certificates/${request.replacement.id}`}>Corrected certificate</Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
