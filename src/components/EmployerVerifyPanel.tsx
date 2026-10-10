"use client";

import { useState, type FormEvent } from "react";
import { VerificationRequestError, VerificationResult } from "@/components/VerificationResult";
import { verifyCertificate, type CertificateVerificationResult } from "@/lib/api";
import { validateCertificateUid } from "@/lib/verification";

export function EmployerVerifyPanel() {
  const [certificateUid, setCertificateUid] = useState("");
  const [checkedUid, setCheckedUid] = useState("");
  const [result, setResult] = useState<CertificateVerificationResult | null>(null);
  const [validationError, setValidationError] = useState("");
  const [requestError, setRequestError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

  function clearOutcome() {
    setResult(null);
    setValidationError("");
    setRequestError("");
  }

  function handleChange(value: string) {
    setCertificateUid(value);
    // Never leave a verdict on screen next to a UID it wasn't produced for.
    clearOutcome();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const uid = certificateUid.trim();
    clearOutcome();

    const invalidReason = validateCertificateUid(uid);
    if (invalidReason) {
      setValidationError(invalidReason);
      return;
    }

    setIsVerifying(true);
    try {
      const response = await verifyCertificate(uid);
      setCheckedUid(uid);
      setResult(response);
    } catch (verificationError) {
      setRequestError(verificationError instanceof Error ? verificationError.message : "Verification could not be completed.");
    } finally {
      setIsVerifying(false);
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">Manual verification</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">Verify a certificate</h1>
        <p className="mt-2 text-slate-600">Enter the certificate ID printed on the certificate to check its details and current status.</p>
      </div>

      <form className="space-y-2" noValidate onSubmit={handleSubmit}>
        <label className="block text-sm font-medium text-slate-700" htmlFor="certificate-uid">Certificate ID</label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            aria-describedby={validationError ? "certificate-uid-error" : undefined}
            aria-invalid={validationError ? true : undefined}
            autoComplete="off"
            className={`min-w-0 flex-1 rounded-md border bg-white px-4 py-3 font-mono text-base text-slate-950 outline-none focus:ring-2 ${validationError ? "border-red-500 focus:border-red-600 focus:ring-red-100" : "border-slate-300 focus:border-teal-600 focus:ring-teal-100"}`}
            id="certificate-uid"
            onChange={(event) => handleChange(event.target.value)}
            placeholder="e.g. 3f2b8c1e-5a6d-4e7f-9a0b-1c2d3e4f5a6b"
            spellCheck={false}
            value={certificateUid}
          />
          <button className="rounded-md bg-teal-700 px-6 py-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60" disabled={isVerifying} type="submit">
            {isVerifying ? "Verifying..." : "Verify"}
          </button>
        </div>
        {validationError && <p className="text-sm text-red-700" id="certificate-uid-error" role="alert">{validationError}</p>}
      </form>

      {requestError && <VerificationRequestError message={requestError} />}
      {result && <VerificationResult checkedUid={checkedUid} result={result} />}
    </section>
  );
}
