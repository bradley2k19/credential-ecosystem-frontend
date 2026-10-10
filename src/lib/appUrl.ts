/**
 * The public origin used in shared links and QR codes. NEXT_PUBLIC_APP_URL wins so a QR code generated
 * while developing locally still points at the deployed site; otherwise the current origin is used.
 */
export function getAppOrigin() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  return typeof window === "undefined" ? "" : window.location.origin;
}

export function getVerificationLink(certificateUid: string) {
  return `${getAppOrigin()}/verify/${encodeURIComponent(certificateUid)}`;
}

/** The link a QR code encodes; ?m=qr records the check as a scan. */
export function getQrVerificationLink(certificateUid: string) {
  return `${getVerificationLink(certificateUid)}?m=qr`;
}
