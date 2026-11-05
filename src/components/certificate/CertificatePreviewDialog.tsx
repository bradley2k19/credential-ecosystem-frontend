"use client";

import { useEffect, useRef, useState } from "react";
import { ScaledCertificate } from "@/components/certificate/ScaledCertificate";
import { getInstitutionCertificate, type InstitutionCertificateDetail } from "@/lib/api";
import { renderDataFromCertificate } from "@/lib/certificateDesign";
import { certificatePdfFileName, exportCertificatePdf } from "@/lib/certificatePdf";

/** A modal showing one of the institution's certificates with the shared renderer, plus its PDF download. */
export function CertificatePreviewDialog({ certificateId, onClose }: { certificateId: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [certificate, setCertificate] = useState<InstitutionCertificateDetail | null>(null);
  const [error, setError] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  useEffect(() => {
    let active = true;
    void getInstitutionCertificate(certificateId)
      .then((response) => { if (active) setCertificate(response); })
      .catch((requestError: unknown) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "The certificate could not be loaded.");
      });
    return () => { active = false; };
  }, [certificateId]);

  const isRevoked = certificate?.status === "REVOKED";

  async function handleDownload() {
    if (!certificate || isRevoked) return;
    setIsExporting(true);
    setExportError("");
    try {
      await exportCertificatePdf({
        snapshot: certificate.renderSnapshot,
        data: renderDataFromCertificate(certificate),
        fileName: certificatePdfFileName(certificate.programName, certificate.certificateUid),
      });
    } catch {
      setExportError("The PDF could not be generated. Please try again.");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <dialog
      aria-labelledby="certificate-preview-title"
      className="m-auto w-[calc(100%-2rem)] max-w-5xl rounded-2xl bg-white p-6 text-slate-900 shadow-xl backdrop:bg-slate-950/40"
      onCancel={(event) => { if (isExporting) event.preventDefault(); else onClose(); }}
      ref={dialogRef}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-950" id="certificate-preview-title">Certificate preview</h2>
          {certificate && (
            <p className="mt-1 text-sm text-slate-600">
              {certificate.student.fullName} · {certificate.certificateType} · {certificate.programName}
              {certificate.templateName ? ` · Template: ${certificate.templateName}` : ""}
            </p>
          )}
        </div>
        <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50" disabled={isExporting} onClick={onClose} type="button">Close</button>
      </div>

      {error && <p className="mt-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</p>}
      {!certificate && !error && <p className="mt-4 text-sm text-slate-600">Loading certificate...</p>}
      {certificate && (
        <>
          <div className="mt-4 rounded-md bg-slate-100 p-4">
            <ScaledCertificate data={renderDataFromCertificate(certificate)} snapshot={certificate.renderSnapshot} />
            {certificate.snapshotIsFallback && <p className="mt-3 text-center text-xs text-slate-500">This certificate was issued before custom templates.</p>}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
              disabled={isRevoked || isExporting}
              onClick={() => void handleDownload()}
              type="button"
            >
              {isExporting ? "Preparing PDF..." : "Download PDF"}
            </button>
            {isRevoked && <p className="text-sm text-amber-900">This certificate has been revoked and cannot be downloaded.</p>}
            {exportError && <p className="text-sm text-red-700" role="alert">{exportError}</p>}
          </div>
        </>
      )}
    </dialog>
  );
}
