// Certificate design format version 1, as defined by the backend (/api/templates/options and its zod schema),
// plus the pure helpers the renderer needs. No React here.

export type ColorToken = "primary" | "accent" | "text" | "muted";
export type Align = "left" | "center" | "right";
export type DateFormat = "DD MMMM YYYY" | "MMMM D, YYYY" | "DD/MM/YYYY" | "YYYY-MM-DD";

export interface TemplateDesign {
  schemaVersion: 1;
  page: { size: "A4" | "LETTER"; orientation: "landscape" | "portrait" };
  theme: {
    primaryColor: string; accentColor: string; textColor: string; mutedColor: string; backgroundColor: string;
    headingFont: string; bodyFont: string; nameFont: string;
  };
  border: { style: "none" | "single" | "double" | "frame"; widthMm: number; color: ColorToken; insetMm: number };
  background: { watermark: "none" | "logo" | "seal"; watermarkOpacity: number; accentBar: "none" | "top" | "left" };
  header: {
    showLogo: boolean; showSeal: boolean; logoPosition: Align; logoHeightMm: number;
    showInstitutionName: boolean; institutionNameColor: ColorToken; institutionNameSizePt: number;
  };
  title: { text: string; sizePt: number; align: Align; color: ColorToken; letterSpacing: number; uppercase: boolean };
  body: { text: string; sizePt: number; align: Align; lineHeight: number; nameSizePt: number; nameColor: ColorToken };
  fields: { dateFormat: DateFormat; showClassification: boolean; showGraduationDate: boolean; showStudentNumber: boolean };
  signatories: { ids: string[]; showTitles: boolean; lineStyle: "line" | "none" };
  footer: { text: string; align: Align; sizePt: number };
  verification: { qrPosition: "bottom-left" | "bottom-center" | "bottom-right"; qrSizeMm: number };
}

/** What a certificate is drawn from: frozen at issuance, or built for a preview. */
export interface RenderSnapshot {
  snapshotVersion: 1;
  template: { id: string | null; name: string };
  design: TemplateDesign;
  institution: { name: string; brandColor: string | null; logoAssetId: string | null; sealAssetId: string | null };
  signatories: { name: string; title: string; signatureAssetId: string | null }[];
}

/** The certificate's own values, used for placeholders, detail lines and the mandatory ID/QR lines. */
export interface CertificateRenderData {
  certificateUid: string;
  studentName: string;
  studentNumber: string | null;
  certificateType: string;
  programName: string;
  classification: string | null;
  issueDate: string | null;
  graduationDate: string | null;
  institutionName: string;
}

export const MM_TO_PX = 3.7795;

const pageSizesMm = { A4: { width: 297, height: 210 }, LETTER: { width: 279.4, height: 215.9 } } as const;

/** Page size in millimetres; the long side is horizontal in landscape and vertical in portrait. */
export function pageSizeMm(page: TemplateDesign["page"]) {
  const size = pageSizesMm[page.size] ?? pageSizesMm.A4;
  return page.orientation === "portrait" ? { width: size.height, height: size.width } : { width: size.width, height: size.height };
}

export function mm(value: number) {
  return value * MM_TO_PX;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Formats an ISO date (stored as UTC midnight) without a date library; returns "" when absent or invalid. */
export function formatDesignDate(value: string | null | undefined, format: DateFormat) {
  if (!value) return "";
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return "";
  const day = date.getUTCDate();
  const month = date.getUTCMonth();
  const year = date.getUTCFullYear();
  const pad = (number: number) => String(number).padStart(2, "0");
  switch (format) {
    case "MMMM D, YYYY": return `${MONTHS[month]} ${day}, ${year}`;
    case "DD/MM/YYYY": return `${pad(day)}/${pad(month + 1)}/${year}`;
    case "YYYY-MM-DD": return `${year}-${pad(month + 1)}-${pad(day)}`;
    default: return `${pad(day)} ${MONTHS[month]} ${year}`;
  }
}

export function placeholderValues(data: CertificateRenderData, snapshot: RenderSnapshot): Record<string, string> {
  const format = snapshot.design.fields.dateFormat;
  return {
    student_name: data.studentName,
    student_number: data.studentNumber ?? "",
    certificate_type: data.certificateType,
    program_name: data.programName,
    classification: data.classification ?? "",
    issue_date: formatDesignDate(data.issueDate, format),
    graduation_date: formatDesignDate(data.graduationDate, format),
    // The name frozen with the certificate, so a later rename does not change issued certificates.
    institution_name: snapshot.institution.name || data.institutionName,
    certificate_id: data.certificateUid,
  };
}

/** Collapses the gaps a missing optional value leaves behind: double spaces, " ," " ." and repeated commas. */
export function tidyText(text: string) {
  return text
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,;:])(?:\s*[,;:])+/g, "$1")
    .replace(/,\s*\./g, ".")
    .replace(/^[\s,;:.]+/, "")
    .trim();
}

/** Replaces {{placeholders}} with plain-text values. Unknown names become empty (the backend rejects them anyway). */
export function resolvePlaceholders(text: string, values: Record<string, string>) {
  return text.replace(/\{\{([a-z_]+)\}\}/g, (_, name: string) => values[name] ?? "");
}

/**
 * Splits the body at the first {{student_name}}: the text before, then the recipient's name on its own line,
 * then the text after. Later occurrences of {{student_name}} stay inline as plain text.
 */
export function splitBody(text: string, values: Record<string, string>) {
  const marker = "{{student_name}}";
  const index = text.indexOf(marker);
  if (index === -1) return { before: tidyText(resolvePlaceholders(text, values)), name: "", after: "" };
  return {
    before: tidyText(resolvePlaceholders(text.slice(0, index), values)),
    name: values.student_name,
    after: tidyText(resolvePlaceholders(text.slice(index + marker.length), values)),
  };
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The only image URL the renderer ever uses: this site's same-origin proxy of the API's asset route (see the
 * rewrite in next.config.ts), and only for a well-formed id. Same-origin images need no CORS, so the browser
 * cache can never hand the renderer or the PDF capture a copy that fails a CORS check.
 */
export function certificateAssetUrl(assetId: string | null | undefined) {
  if (!process.env.NEXT_PUBLIC_API_URL || !assetId || !uuidPattern.test(assetId)) return null;
  return `/asset-proxy/${assetId}`;
}

/** The asset id at the end of an API path such as /api/assets/<id>, or null. */
export function assetIdFromPath(path: string | null | undefined) {
  const match = path?.match(/\/api\/assets\/([0-9a-f-]{36})$/i);
  return match && uuidPattern.test(match[1]) ? match[1] : null;
}

/**
 * Builds a snapshot for a live preview from a design, the institution profile and its active signatories,
 * the same shape the backend freezes at issuance. Signatories follow design.signatories.ids; unknown ids are skipped.
 */
export function buildPreviewSnapshot(
  design: TemplateDesign,
  profile: { name: string; brandColor: string | null; logoUrl: string | null; sealUrl: string | null },
  signatories: { id: string; name: string; title: string; signatureUrl: string | null }[],
  template: { id: string | null; name: string } = { id: null, name: "Preview" },
): RenderSnapshot {
  return {
    snapshotVersion: 1,
    template,
    design,
    institution: {
      name: profile.name,
      brandColor: profile.brandColor,
      logoAssetId: assetIdFromPath(profile.logoUrl),
      sealAssetId: assetIdFromPath(profile.sealUrl),
    },
    signatories: design.signatories.ids
      .map((id) => signatories.find((signatory) => signatory.id === id))
      .filter((signatory): signatory is NonNullable<typeof signatory> => Boolean(signatory))
      .map((signatory) => ({ name: signatory.name, title: signatory.title, signatureAssetId: assetIdFromPath(signatory.signatureUrl) })),
  };
}

/** Renderer data from a single-certificate API response (student or institution endpoint). */
export function renderDataFromCertificate(certificate: {
  certificateUid: string;
  certificateType: string;
  programName: string;
  classification: string | null;
  issueDate: string;
  graduationDate: string | null;
  institutionName: string;
  student: { fullName: string; studentNumber: string };
}): CertificateRenderData {
  return {
    certificateUid: certificate.certificateUid,
    studentName: certificate.student.fullName,
    studentNumber: certificate.student.studentNumber,
    certificateType: certificate.certificateType,
    programName: certificate.programName,
    classification: certificate.classification,
    issueDate: certificate.issueDate,
    graduationDate: certificate.graduationDate,
    institutionName: certificate.institutionName,
  };
}

/** Every font id a design uses, for loading them before a PDF capture. */
export function designFontIds(design: TemplateDesign) {
  return [...new Set([design.theme.headingFont, design.theme.bodyFont, design.theme.nameFont])];
}
