"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { validateCertificateUid } from "@/lib/verification";

export function PublicVerifyForm() {
  const router = useRouter();
  const [certificateUid, setCertificateUid] = useState("");
  const [validationError, setValidationError] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const uid = certificateUid.trim();
    const invalidReason = validateCertificateUid(uid);
    if (invalidReason) {
      setValidationError(invalidReason);
      return;
    }
    router.push(`/verify/${encodeURIComponent(uid)}`);
  }

  return (
    <form className="space-y-2" noValidate onSubmit={handleSubmit}>
      <label className="block text-sm font-medium text-slate-700" htmlFor="public-certificate-uid">Certificate ID</label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          aria-describedby={validationError ? "public-certificate-uid-error" : undefined}
          aria-invalid={validationError ? true : undefined}
          autoComplete="off"
          className={`min-w-0 flex-1 rounded-md border bg-white px-4 py-3 font-mono text-base text-slate-950 outline-none focus:ring-2 ${validationError ? "border-red-500 focus:border-red-600 focus:ring-red-100" : "border-slate-300 focus:border-teal-600 focus:ring-teal-100"}`}
          id="public-certificate-uid"
          onChange={(event) => { setCertificateUid(event.target.value); setValidationError(""); }}
          placeholder="e.g. 3f2b8c1e-5a6d-4e7f-9a0b-1c2d3e4f5a6b"
          spellCheck={false}
          value={certificateUid}
        />
        <button className="rounded-md bg-teal-700 px-6 py-3 text-sm font-semibold text-white hover:bg-teal-800" type="submit">Verify</button>
      </div>
      {validationError && <p className="text-sm text-red-700" id="public-certificate-uid-error" role="alert">{validationError}</p>}
    </form>
  );
}
