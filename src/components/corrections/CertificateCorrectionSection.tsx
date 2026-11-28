"use client";

import Link from "next/link";
import { useEffect, useId, useState, type FormEvent } from "react";
import { CorrectionStageBadge } from "@/components/corrections/CorrectionStageBadge";
import { Modal } from "@/components/Modal";
import {
  CORRECTION_DETAILS_MAX,
  CORRECTION_DETAILS_MIN,
  getStudentCorrectionRequests,
  requestCertificateCorrection,
  type CorrectionRequest,
} from "@/lib/api";
import { formatCertificateDate } from "@/lib/verification";

/**
 * The correction part of a student's certificate page: the latest correction request for this certificate with
 * its stage, or (for an active certificate) a button to ask the institution for a correction.
 */
export function CertificateCorrectionSection({ certificateId, status }: { certificateId: string; status: string }) {
  const [latest, setLatest] = useState<CorrectionRequest | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  useEffect(() => {
    let active = true;
    void getStudentCorrectionRequests()
      .then((response) => {
        // Newest first: the first one for this certificate is the latest.
        if (active) setLatest(response.correctionRequests.find((request) => request.certificate.id === certificateId) ?? null);
      })
      .catch((error: unknown) => { if (active) setLoadError(error instanceof Error ? error.message : "Your correction requests could not be loaded."); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [certificateId]);

  if (isLoading) return null;
  const isActive = status === "ACTIVE";
  const canRequest = isActive && (!latest || latest.stage === "rejected");
  if (!latest && !isActive && !loadError) return null;

  return (
    <section className="rounded-md border border-slate-200 p-5" data-correction-section="">
      <h2 className="text-xl font-semibold text-slate-950">Corrections</h2>
      {loadError && <p className="mt-3 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{loadError}</p>}

      {latest ? (
        <div className="mt-3 space-y-2 text-sm text-slate-700" data-correction-status={latest.stage}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-900">Your correction request</span>
            <CorrectionStageBadge audience="student" stage={latest.stage} />
          </div>
          <p>Requested on {formatCertificateDate(latest.requestedAt)}.</p>
          {latest.resolutionNote && <p><span className="font-semibold">Note from the institution: </span>{latest.resolutionNote}</p>}
          {latest.replacement && (
            <p>
              A corrected certificate was issued:{" "}
              <Link className="font-semibold text-teal-700 underline" href={`/student/certificates/${latest.replacement.id}`}>view the corrected certificate</Link>.
            </p>
          )}
          <p><Link className="font-semibold text-teal-700 hover:text-teal-900" href="/student/corrections">All my correction requests</Link></p>
        </div>
      ) : (
        <p className="mt-2 text-sm text-slate-600">Is something wrong on this certificate? Your institution can correct it by issuing a corrected certificate.</p>
      )}

      {canRequest && (
        <button className="mt-4 rounded-md border border-teal-600 px-4 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-50" onClick={() => setIsDialogOpen(true)} type="button">
          {latest ? "Request another correction" : "Request a correction"}
        </button>
      )}

      {isDialogOpen && (
        <CorrectionRequestDialog
          certificateId={certificateId}
          onClose={() => setIsDialogOpen(false)}
          onCreated={(request) => { setLatest(request); setIsDialogOpen(false); }}
        />
      )}
    </section>
  );
}

function CorrectionRequestDialog({ certificateId, onClose, onCreated }: { certificateId: string; onClose: () => void; onCreated: (request: CorrectionRequest) => void }) {
  const fieldId = useId();
  const hintId = useId();
  const [details, setDetails] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const length = details.trim().length;
  const tooShort = length < CORRECTION_DETAILS_MIN;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (tooShort) {
      setError(`Please describe the correction in at least ${CORRECTION_DETAILS_MIN} characters.`);
      return;
    }
    setIsSubmitting(true);
    setError("");
    try {
      onCreated(await requestCertificateCorrection(certificateId, details.trim()));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Your request could not be sent.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal isBusy={isSubmitting} onClose={onClose} size="lg" testId="correction-request-dialog" title="Request a correction">
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Your institution reviews the request. If it agrees, it issues a corrected certificate and revokes this one. This certificate does not change in the meantime.
      </p>
      <form className="mt-4 space-y-3" noValidate onSubmit={handleSubmit}>
        <label className="block text-sm font-medium text-slate-700" htmlFor={fieldId}>
          What needs correcting
          <textarea
            aria-describedby={hintId}
            className="field min-h-32"
            id={fieldId}
            maxLength={CORRECTION_DETAILS_MAX}
            onChange={(event) => { setDetails(event.target.value); setError(""); }}
            value={details}
          />
        </label>
        <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-500" id={hintId}>
          <span>Describe what is wrong and what it should say.</span>
          <span data-character-count="">{length} / {CORRECTION_DETAILS_MAX}{tooShort ? ` (at least ${CORRECTION_DETAILS_MIN})` : ""}</span>
        </div>
        {error && <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" disabled={isSubmitting} onClick={onClose} type="button">Cancel</button>
          <button className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60" disabled={isSubmitting || tooShort} type="submit">
            {isSubmitting ? "Sending..." : "Send request"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
