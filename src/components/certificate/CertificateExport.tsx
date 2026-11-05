"use client";

import { useState } from "react";
import { exportCertificatePdf, exportFailureDetails, type CertificateExportResult, type ExportFailureDetails } from "@/lib/certificatePdf";

/** Runs a certificate PDF export (one at a time per button) and keeps its outcome for display. */
export function useCertificateExport() {
  const [isExporting, setIsExporting] = useState(false);
  const [result, setResult] = useState<CertificateExportResult | null>(null);
  const [failure, setFailure] = useState<ExportFailureDetails | null>(null);

  async function runExport(options: Parameters<typeof exportCertificatePdf>[0]) {
    if (isExporting) return;
    setIsExporting(true);
    setResult(null);
    setFailure(null);
    try {
      setResult(await exportCertificatePdf(options));
    } catch (error) {
      setFailure(exportFailureDetails(error));
    } finally {
      setIsExporting(false);
    }
  }

  return { isExporting, result, failure, runExport };
}

/**
 * The outcome of an export: an optional success line, a warning when images had to be left out, or the failure
 * message with a collapsible line of technical details (the step that failed and the underlying error).
 */
export function CertificateExportFeedback({ result, failure, showSize = false }: {
  result: CertificateExportResult | null;
  failure: ExportFailureDetails | null;
  showSize?: boolean;
}) {
  if (!result && !failure) return null;
  return (
    <div className="space-y-1">
      {result && showSize && <p className="text-sm text-emerald-700" role="status">PDF downloaded ({(result.sizeBytes / 1024 / 1024).toFixed(1)} MB).</p>}
      {result?.warning && <p className="text-sm text-amber-800" role="status">{result.warning}</p>}
      {failure && (
        <div className="text-sm text-red-700" role="alert">
          <p>The PDF could not be generated. Please try again.</p>
          <details className="mt-1 text-xs text-red-800">
            <summary className="cursor-pointer font-semibold">Technical details</summary>
            <p className="mt-1 break-words font-mono">Failed while {failure.stepDescription}: {failure.detail}</p>
          </details>
        </div>
      )}
    </div>
  );
}
