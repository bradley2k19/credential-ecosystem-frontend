"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { VerificationRequestError, VerificationResult } from "@/components/VerificationResult";
import { ApiError, verifyCertificate, type CertificateVerificationResult } from "@/lib/api";
import { validateCertificateUid } from "@/lib/verification";

type VerificationState =
  | { status: "loading" }
  | { status: "done"; result: CertificateVerificationResult }
  | { status: "error"; message: string };

// Every call is recorded as a verification, so a remount (React strict mode in development) must reuse the
// request already in flight instead of logging the same check twice.
const inFlight = new Map<string, Promise<CertificateVerificationResult>>();

function verifyOnce(certificateUid: string, method: "qr" | "manual_id", attempt: number) {
  const key = `${certificateUid}|${method}|${attempt}`;
  let pending = inFlight.get(key);
  if (!pending) {
    pending = verifyCertificate(certificateUid, method).finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
  }
  return pending;
}

export function PublicVerification({ certificateUid, method }: { certificateUid: string; method: "qr" | "manual_id" }) {
  const [state, setState] = useState<VerificationState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const invalidReason = validateCertificateUid(certificateUid.trim());

  useEffect(() => {
    if (invalidReason) return;
    let active = true;
    verifyOnce(certificateUid.trim(), method, attempt)
      .then((result) => { if (active) setState({ status: "done", result }); })
      .catch((error: unknown) => {
        if (!active) return;
        setState({
          status: "error",
          // fetch rejects with a TypeError when the service can't be reached at all.
          message: error instanceof ApiError ? error.message : "The verification service could not be reached. Check your internet connection.",
        });
      });
    return () => { active = false; };
  }, [attempt, certificateUid, invalidReason, method]);

  function handleRetry() {
    setState({ status: "loading" });
    setAttempt((current) => current + 1);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold text-slate-950">Certificate verification</h1>

      {invalidReason ? (
        <div className="rounded-md border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700" role="alert">
          <p className="font-semibold text-slate-900">This link does not contain a valid certificate ID</p>
          <p className="mt-1 break-all">Nothing was checked. Scan the QR code again or enter the ID printed on the certificate.</p>
        </div>
      ) : state.status === "loading" ? (
        <p className="rounded-md bg-slate-50 px-4 py-6 text-center text-slate-600" role="status">Verifying certificate...</p>
      ) : state.status === "error" ? (
        <div className="space-y-3">
          <VerificationRequestError message={state.message} />
          <button className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800" onClick={handleRetry} type="button">Try again</button>
        </div>
      ) : (
        <VerificationResult checkedUid={certificateUid.trim()} result={state.result} />
      )}

      <p><Link className="font-semibold text-teal-700 underline hover:text-teal-900" href="/verify">Verify another certificate</Link></p>
    </div>
  );
}
