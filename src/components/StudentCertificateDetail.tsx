"use client";

import Image from "next/image";
import Link from "next/link";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { CertificateStatusBadge, isConfirmedOnChain, OnChainBadge } from "@/components/StudentCertificateBadges";
import { getStudentCertificate, getStudentProfile, type StudentCertificate, type StudentProfile } from "@/lib/api";
import { getQrVerificationLink, getVerificationLink } from "@/lib/appUrl";
import { downloadCertificatePdf } from "@/lib/certificatePdf";
import { formatCertificateDate } from "@/lib/verification";

const QR_SIZE = 256;

export function StudentCertificateDetail({ certificateId }: { certificateId: string }) {
  const [certificate, setCertificate] = useState<StudentCertificate | null>(null);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState("");
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([getStudentCertificate(certificateId), getStudentProfile()])
      .then(async ([loadedCertificate, loadedProfile]) => {
        // Generated at 2x the display size so it stays sharp on screen and in the PDF.
        const qr = await QRCode.toDataURL(getQrVerificationLink(loadedCertificate.certificateUid), { width: QR_SIZE * 2, margin: 2, errorCorrectionLevel: "M" });
        if (!active) return;
        setCertificate(loadedCertificate);
        setProfile(loadedProfile);
        setQrDataUrl(qr);
      })
      .catch((requestError: unknown) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "This certificate could not be loaded.");
      })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [certificateId]);

  const backLink = <Link className="text-sm font-semibold text-teal-700 hover:text-teal-900" href="/student/dashboard">&larr; Back to my certificates</Link>;

  if (isLoading) return <p className="text-sm text-slate-600">Loading certificate...</p>;
  if (error || !certificate || !profile) {
    return (
      <div className="space-y-4">
        {backLink}
        <p className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error || "This certificate could not be loaded."}</p>
      </div>
    );
  }

  const isRevoked = certificate.status === "REVOKED";
  const verificationLink = getVerificationLink(certificate.certificateUid);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function handleCopy() {
    setActionError("");
    try {
      await navigator.clipboard.writeText(verificationLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setActionError("The link could not be copied automatically. Select it above and copy it manually.");
    }
  }

  async function handleShare() {
    setActionError("");
    try {
      await navigator.share({
        title: `${certificate!.certificateType} — ${certificate!.programName}`,
        text: "Verify the authenticity of this certificate:",
        url: verificationLink,
      });
    } catch (shareError) {
      // Closing the share sheet is not an error.
      if (!(shareError instanceof DOMException && shareError.name === "AbortError")) setActionError("Sharing is not available right now. Copy the link instead.");
    }
  }

  async function handleDownload() {
    setActionError("");
    setIsGeneratingPdf(true);
    try {
      await downloadCertificatePdf({ certificate: certificate!, profile: profile!, qrDataUrl });
    } catch {
      setActionError("The PDF could not be generated. Please try again.");
    } finally {
      setIsGeneratingPdf(false);
    }
  }

  return (
    <div className="space-y-6">
      {backLink}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">{certificate.institutionName}</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">{certificate.certificateType}</h1>
          <p className="mt-1 text-slate-600">{certificate.programName}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CertificateStatusBadge status={certificate.status} />
          <OnChainBadge certificate={certificate} />
        </div>
      </div>

      {isRevoked && (
        <div className="rounded-md border border-amber-400 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
          <p className="font-semibold">This certificate has been revoked by the institution.</p>
          <p><span className="font-semibold">Reason: </span>{certificate.revokedReason || "No reason was provided."}</p>
        </div>
      )}
      {!isConfirmedOnChain(certificate) && (
        <p className="rounded-md border border-sky-300 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-950">
          Blockchain confirmation is still pending, so the verification page may show &ldquo;pending&rdquo; until it completes. You can still view and share this certificate.
        </p>
      )}

      <dl className="grid gap-x-6 gap-y-4 rounded-md border border-slate-200 p-5 sm:grid-cols-2">
        <Detail label="Awarded to" value={`${profile.fullName} (${profile.studentNumber})`} />
        <Detail label="Institution" value={certificate.institutionName} />
        <Detail label="Certificate type" value={certificate.certificateType} />
        <Detail label="Programme" value={certificate.programName} />
        <Detail label="Classification" value={certificate.classification || "Not specified"} />
        <Detail label="Issue date" value={formatCertificateDate(certificate.issueDate)} />
        <Detail label="Graduation date" value={certificate.graduationDate ? formatCertificateDate(certificate.graduationDate) : "Not specified"} />
        <Detail label="Certificate ID" mono value={certificate.certificateUid} />
      </dl>

      <section className="rounded-md border border-slate-200 p-5">
        <h2 className="text-xl font-semibold text-slate-950">Share and verify</h2>
        <p className="mt-1 text-sm text-slate-600">Anyone can scan this code or open the link to check this certificate. They do not need an account.</p>

        <div className="mt-5 flex flex-col items-center gap-6 md:flex-row md:items-start">
          <div className="shrink-0 text-center">
            <Image alt={`QR code linking to the verification page for certificate ${certificate.certificateUid}`} className="rounded-md border border-slate-200" height={QR_SIZE} src={qrDataUrl} unoptimized width={QR_SIZE} />
            <p className="mt-2 max-w-64 break-all font-mono text-xs text-slate-700">{certificate.certificateUid}</p>
          </div>

          <div className="min-w-0 flex-1 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="verification-link">Verification link</label>
              <input className="field font-mono text-sm" id="verification-link" onFocus={(event) => event.target.select()} readOnly value={verificationLink} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800" onClick={() => void handleCopy()} type="button">Copy verification link</button>
              {canShare && <button className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => void handleShare()} type="button">Share</button>}
              {copied && <span className="text-sm font-semibold text-emerald-700" role="status">Copied</span>}
            </div>

            <div className="border-t border-slate-200 pt-4">
              <button className="rounded-md border border-teal-600 px-4 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-50 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400 disabled:hover:bg-transparent" disabled={isRevoked || isGeneratingPdf} onClick={() => void handleDownload()} type="button">
                {isGeneratingPdf ? "Preparing PDF..." : "Download PDF"}
              </button>
              {isRevoked && <p className="mt-2 text-sm text-amber-900">This certificate has been revoked and cannot be downloaded.</p>}
            </div>

            {actionError && <p className="text-sm text-red-700" role="alert">{actionError}</p>}
          </div>
        </div>
      </section>
    </div>
  );
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={`mt-1 break-words font-medium text-slate-900 ${mono ? "break-all font-mono text-sm" : ""}`}>{value}</dd>
    </div>
  );
}
