const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Returns an error message for a certificate ID that can't be valid, or "" when it looks right. */
export function validateCertificateUid(uid: string) {
  if (!uid) return "Enter a certificate ID to verify.";
  if (!uuidPattern.test(uid)) return "That doesn't look like a certificate ID. IDs look like 3f2b8c1e-5a6d-4e7f-9a0b-1c2d3e4f5a6b.";
  return "";
}

// Badge wording and colours for stored verification results; the colours match the full result display.
export const verificationResultLabels: Record<string, string> = {
  VALID: "Valid",
  REVOKED: "Revoked",
  NOT_FOUND: "Not found",
  TAMPERED: "Tampered",
  PENDING_CHAIN: "Pending chain",
};

export const verificationResultClasses: Record<string, string> = {
  VALID: "bg-emerald-100 text-emerald-800",
  REVOKED: "bg-amber-100 text-amber-900",
  NOT_FOUND: "bg-slate-100 text-slate-700",
  TAMPERED: "bg-red-100 text-red-900",
  PENDING_CHAIN: "bg-sky-100 text-sky-900",
};

/** Certificate dates are stored as UTC midnight; format in UTC so they never shift by a day. */
export function formatCertificateDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
