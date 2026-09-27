"use client";

import { useState, type FormEvent } from "react";
import { verifyCertificate, type CertificateVerificationResult, type VerificationResult } from "@/lib/api";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const resultPresentation: Record<VerificationResult, { title: string; message: string; classes: string; icon: string }> = {
  valid: {
    title: "Certificate verified",
    message: "The certificate is valid and its details match the verified record.",
    classes: "border-emerald-300 bg-emerald-50 text-emerald-950",
    icon: "✓",
  },
  revoked: {
    title: "Certificate revoked",
    message: "This certificate was previously issued but has been revoked.",
    classes: "border-amber-400 bg-amber-50 text-amber-950",
    icon: "!",
  },
  not_found: {
    title: "Certificate not found",
    message: "No certificate exists with this identifier.",
    classes: "border-slate-300 bg-slate-50 text-slate-800",
    icon: "?",
  },
  tampered: {
    title: "Certificate integrity warning",
    message: "This certificate's details do not match its blockchain record and should not be trusted.",
    classes: "border-red-500 bg-red-50 text-red-950",
    icon: "×",
  },
  "pending-chain": {
    title: "Blockchain confirmation pending",
    message: "The certificate exists and appears legitimate, but its blockchain confirmation is still pending.",
    classes: "border-sky-300 bg-sky-50 text-sky-950",
    icon: "…",
  },
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

export function EmployerVerifyPanel() {
  const [certificateUid, setCertificateUid] = useState("");
  const [result, setResult] = useState<CertificateVerificationResult | null>(null);
  const [error, setError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const uid = certificateUid.trim();
    setResult(null);
    setError("");

    if (!uid || !uuidPattern.test(uid)) {
      setError("Enter a certificate UID in UUID format.");
      return;
    }

    setIsVerifying(true);
    try {
      setResult(await verifyCertificate(uid));
    } catch (verificationError) {
      setError(verificationError instanceof Error ? verificationError.message : "Verification could not be completed.");
    } finally {
      setIsVerifying(false);
    }
  }

  const presentation = result ? resultPresentation[result.result] : null;

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">Manual verification</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">Verify a certificate</h1>
        <p className="mt-2 text-slate-600">Enter the certificate UID to check its details and current status.</p>
      </div>

      <form className="flex flex-col gap-3 sm:flex-row" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor="certificate-uid">Certificate UID</label>
        <input
          autoComplete="off"
          className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-4 py-3 font-mono text-base text-slate-950 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
          id="certificate-uid"
          onChange={(event) => setCertificateUid(event.target.value)}
          placeholder="Enter certificate UID"
          value={certificateUid}
        />
        <button className="rounded-md bg-teal-700 px-6 py-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60" disabled={isVerifying} type="submit">
          {isVerifying ? "Verifying..." : "Verify"}
        </button>
      </form>

      {error && <p className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</p>}

      {result && presentation && (
        <section aria-live="polite" className={`rounded-lg border-2 p-5 sm:p-6 ${presentation.classes}`}>
          <div className="flex items-start gap-4">
            <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full border border-current text-xl font-bold">{presentation.icon}</span>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-bold">{presentation.title}</h2>
              <p className="mt-2 leading-6">{result.message || presentation.message}</p>
              {result.result !== "not_found" && result.certificate && (
                <dl className="mt-5 grid gap-x-6 gap-y-3 border-t border-current/20 pt-4 sm:grid-cols-2">
                  <Detail label="Student" value={`${result.certificate.studentName} (${result.certificate.studentNumber})`} />
                  <Detail label="Certificate type" value={result.certificate.certificateType} />
                  <Detail label="Program" value={result.certificate.programName} />
                  <Detail label="Issue date" value={formatDate(result.certificate.issueDate)} />
                  <Detail label="Institution" value={result.certificate.institutionName} />
                  {result.result === "revoked" && result.revokedReason && <Detail label="Revocation reason" value={result.revokedReason} />}
                </dl>
              )}
            </div>
          </div>
        </section>
      )}
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</dt><dd className="mt-1 break-words font-medium">{value}</dd></div>;
}