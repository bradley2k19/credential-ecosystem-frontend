import type { CertificateVerificationResult, VerificationResult as VerificationOutcome } from "@/lib/api";
import { formatCertificateDate } from "@/lib/verification";

// Each state gets its own colour, icon and verdict wording so no two outcomes can be mistaken for each other.
// Messages are deliberately frontend-owned: backend messages describe internal mechanics verifiers don't need.
const resultPresentation: Record<VerificationOutcome, {
  verdict: string;
  title: string;
  message: string;
  icon: string;
  card: string;
  banner: string;
  detailsHeading?: string;
}> = {
  valid: {
    verdict: "Valid",
    title: "Certificate verified",
    message: "This certificate is genuine, active, and its details match its blockchain record.",
    icon: "✓",
    card: "border-emerald-600 bg-emerald-50 text-emerald-950",
    banner: "bg-emerald-600 text-white",
  },
  revoked: {
    verdict: "Revoked — no longer valid",
    title: "Certificate revoked",
    message: "This certificate was genuinely issued, but the issuing institution has since revoked it. It should not be accepted as a current credential.",
    icon: "!",
    card: "border-amber-500 bg-amber-50 text-amber-950",
    banner: "bg-amber-500 text-amber-950",
  },
  not_found: {
    verdict: "No record",
    title: "Certificate not found",
    message: "No certificate exists with this ID. Check that the ID was entered correctly.",
    icon: "?",
    card: "border-slate-400 bg-slate-50 text-slate-800",
    banner: "bg-slate-500 text-white",
  },
  tampered: {
    verdict: "Do not trust this certificate",
    title: "Certificate details do not match",
    message: "This certificate's details do not match its blockchain record and should not be trusted. Contact the issuing institution directly before relying on it.",
    icon: "×",
    card: "border-red-700 bg-red-50 text-red-950",
    banner: "bg-red-700 text-white",
    detailsHeading: "Details currently on file — these may have been altered and must not be relied on",
  },
  "pending-chain": {
    verdict: "Not yet confirmed",
    title: "Blockchain confirmation pending",
    message: "This certificate exists and appears legitimate, but its blockchain confirmation is still pending. This is not a failure — try again later for a fully confirmed result.",
    icon: "…",
    card: "border-sky-500 bg-sky-50 text-sky-950",
    banner: "bg-sky-600 text-white",
  },
};

/** Renders one verification outcome. Shared by the employer page and the public verification page. */
export function VerificationResult({ result, checkedUid }: { result: CertificateVerificationResult; checkedUid: string }) {
  const presentation = resultPresentation[result.result];
  if (!presentation) return null;

  return (
    <section aria-live="polite" className={`overflow-hidden rounded-lg border-2 ${presentation.card}`}>
      <div className={`flex items-center gap-3 px-5 py-3 sm:px-6 ${presentation.banner}`}>
        <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-current text-lg font-bold">{presentation.icon}</span>
        <p className="text-lg font-bold uppercase tracking-wide">{presentation.verdict}</p>
      </div>
      <div className="p-5 sm:p-6">
        <h2 className="text-xl font-bold">{presentation.title}</h2>
        <p className="mt-2 leading-6">{presentation.message}</p>
        <p className="mt-3 text-sm opacity-80">Certificate ID checked: <span className="break-all font-mono">{checkedUid}</span></p>

        {result.result === "revoked" && (
          <p className="mt-4 rounded-md border border-amber-400 bg-white/70 px-4 py-3">
            <span className="font-semibold">Revocation reason: </span>
            {result.revokedReason || "No reason was provided by the institution."}
          </p>
        )}

        {result.result !== "not_found" && result.certificate && (
          <div className="mt-5 border-t border-current/20 pt-4">
            {presentation.detailsHeading && <p className="mb-3 text-sm font-semibold">{presentation.detailsHeading}</p>}
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <Detail label="Student" value={`${result.certificate.studentName} (${result.certificate.studentNumber})`} />
              <Detail label="Certificate type" value={result.certificate.certificateType} />
              <Detail label="Program" value={result.certificate.programName} />
              {result.certificate.classification && <Detail label="Classification" value={result.certificate.classification} />}
              <Detail label="Issue date" value={formatCertificateDate(result.certificate.issueDate)} />
              <Detail label="Institution" value={result.certificate.institutionName} />
            </dl>
          </div>
        )}
      </div>
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</dt><dd className="mt-1 break-words font-medium">{value}</dd></div>;
}

/** The neutral "this is not a result" box for failed requests, so an outage is never read as a verdict. */
export function VerificationRequestError({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700" role="alert">
      <p className="font-semibold text-slate-900">Verification could not be completed</p>
      <p className="mt-1">{message} This is not a verification result — please try again shortly.</p>
    </div>
  );
}
