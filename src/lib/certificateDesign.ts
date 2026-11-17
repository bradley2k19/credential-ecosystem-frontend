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
export function pageSizeMm(page: TemplateDesign["page"] | undefined) {
  const size = (page && pageSizesMm[page.size]) ?? pageSizesMm.A4;
  return page?.orientation === "portrait" ? { width: size.height, height: size.width } : { width: size.width, height: size.height };
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
    signatories: (Array.isArray(design.signatories?.ids) ? design.signatories.ids : [])
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
  const theme = normalizeDesign(design).theme;
  return [...new Set([theme.headingFont, theme.bodyFont, theme.nameFont])];
}

/**
 * Safe values for anything a design leaves out or gets wrong. They follow the Classic starter, so a design
 * with a damaged field still looks like a certificate rather than failing to draw.
 */
const FALLBACK_DESIGN: TemplateDesign = {
  schemaVersion: 1,
  page: { size: "A4", orientation: "landscape" },
  theme: {
    primaryColor: "#1F2A44", accentColor: "#B08D57", textColor: "#1F2937", mutedColor: "#6B7280", backgroundColor: "#FFFFFF",
    headingFont: "cinzel", bodyFont: "libre-baskerville", nameFont: "great-vibes",
  },
  border: { style: "none", widthMm: 1, color: "accent", insetMm: 10 },
  background: { watermark: "none", watermarkOpacity: 0.06, accentBar: "none" },
  header: { showLogo: true, showSeal: false, logoPosition: "center", logoHeightMm: 22, showInstitutionName: true, institutionNameColor: "primary", institutionNameSizePt: 20 },
  title: { text: "Certificate", sizePt: 40, align: "center", color: "primary", letterSpacing: 0, uppercase: false },
  body: { text: "This is to certify that {{student_name}} has been awarded the {{certificate_type}} in {{program_name}}.", sizePt: 14, align: "center", lineHeight: 1.6, nameSizePt: 36, nameColor: "primary" },
  fields: { dateFormat: "DD MMMM YYYY", showClassification: true, showGraduationDate: true, showStudentNumber: false },
  signatories: { ids: [], showTitles: true, lineStyle: "line" },
  footer: { text: "", align: "center", sizePt: 9 },
  verification: { qrPosition: "bottom-right", qrSizeMm: 26 },
};

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/** A finite number kept within a sane drawing range (far wider than the design limits, which validation enforces). */
function finite(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function text(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function flag(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function color(value: unknown, fallback: string) {
  return typeof value === "string" && HEX_COLOR.test(value) ? value : fallback;
}

/** Plain-object section of an unknown value, so a missing or broken section reads as empty. */
function sectionOf(value: unknown, key: string): Record<string, unknown> {
  const section = value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
  return section && typeof section === "object" && !Array.isArray(section) ? (section as Record<string, unknown>) : {};
}

const TOKENS = ["primary", "accent", "text", "muted"] as const;
const ALIGNS = ["left", "center", "right"] as const;

/**
 * Returns a design the renderer can always draw: every valid value is kept as is, and anything missing, of the
 * wrong type or outside the allowed set falls back to a safe default. It never throws, whatever it is given.
 */
export function normalizeDesign(input: unknown): TemplateDesign {
  const fb = FALLBACK_DESIGN;
  const page = sectionOf(input, "page");
  const theme = sectionOf(input, "theme");
  const border = sectionOf(input, "border");
  const background = sectionOf(input, "background");
  const header = sectionOf(input, "header");
  const title = sectionOf(input, "title");
  const body = sectionOf(input, "body");
  const fields = sectionOf(input, "fields");
  const signatories = sectionOf(input, "signatories");
  const footer = sectionOf(input, "footer");
  const verification = sectionOf(input, "verification");
  return {
    schemaVersion: 1,
    page: {
      size: oneOf(page.size, ["A4", "LETTER"], fb.page.size),
      orientation: oneOf(page.orientation, ["landscape", "portrait"], fb.page.orientation),
    },
    theme: {
      primaryColor: color(theme.primaryColor, fb.theme.primaryColor),
      accentColor: color(theme.accentColor, fb.theme.accentColor),
      textColor: color(theme.textColor, fb.theme.textColor),
      mutedColor: color(theme.mutedColor, fb.theme.mutedColor),
      backgroundColor: color(theme.backgroundColor, fb.theme.backgroundColor),
      headingFont: text(theme.headingFont, fb.theme.headingFont),
      bodyFont: text(theme.bodyFont, fb.theme.bodyFont),
      nameFont: text(theme.nameFont, fb.theme.nameFont),
    },
    border: {
      style: oneOf(border.style, ["none", "single", "double", "frame"], fb.border.style),
      widthMm: finite(border.widthMm, fb.border.widthMm, 0, 10),
      color: oneOf(border.color, TOKENS, fb.border.color),
      insetMm: finite(border.insetMm, fb.border.insetMm, 0, 40),
    },
    background: {
      watermark: oneOf(background.watermark, ["none", "logo", "seal"], fb.background.watermark),
      watermarkOpacity: finite(background.watermarkOpacity, fb.background.watermarkOpacity, 0, 1),
      accentBar: oneOf(background.accentBar, ["none", "top", "left"], fb.background.accentBar),
    },
    header: {
      showLogo: flag(header.showLogo, fb.header.showLogo),
      showSeal: flag(header.showSeal, fb.header.showSeal),
      logoPosition: oneOf(header.logoPosition, ALIGNS, fb.header.logoPosition),
      logoHeightMm: finite(header.logoHeightMm, fb.header.logoHeightMm, 1, 80),
      showInstitutionName: flag(header.showInstitutionName, fb.header.showInstitutionName),
      institutionNameColor: oneOf(header.institutionNameColor, TOKENS, fb.header.institutionNameColor),
      institutionNameSizePt: finite(header.institutionNameSizePt, fb.header.institutionNameSizePt, 1, 100),
    },
    title: {
      text: text(title.text, fb.title.text),
      sizePt: finite(title.sizePt, fb.title.sizePt, 1, 150),
      align: oneOf(title.align, ALIGNS, fb.title.align),
      color: oneOf(title.color, TOKENS, fb.title.color),
      letterSpacing: finite(title.letterSpacing, fb.title.letterSpacing, 0, 30),
      uppercase: flag(title.uppercase, fb.title.uppercase),
    },
    body: {
      text: text(body.text, fb.body.text),
      sizePt: finite(body.sizePt, fb.body.sizePt, 1, 60),
      align: oneOf(body.align, ALIGNS, fb.body.align),
      lineHeight: finite(body.lineHeight, fb.body.lineHeight, 0.8, 4),
      nameSizePt: finite(body.nameSizePt, fb.body.nameSizePt, 1, 120),
      nameColor: oneOf(body.nameColor, TOKENS, fb.body.nameColor),
    },
    fields: {
      dateFormat: oneOf(fields.dateFormat, ["DD MMMM YYYY", "MMMM D, YYYY", "DD/MM/YYYY", "YYYY-MM-DD"], fb.fields.dateFormat),
      showClassification: flag(fields.showClassification, fb.fields.showClassification),
      showGraduationDate: flag(fields.showGraduationDate, fb.fields.showGraduationDate),
      showStudentNumber: flag(fields.showStudentNumber, fb.fields.showStudentNumber),
    },
    signatories: {
      ids: Array.isArray(signatories.ids) ? signatories.ids.filter((id): id is string => typeof id === "string") : [],
      showTitles: flag(signatories.showTitles, fb.signatories.showTitles),
      lineStyle: oneOf(signatories.lineStyle, ["line", "none"], fb.signatories.lineStyle),
    },
    footer: {
      text: text(footer.text, fb.footer.text),
      align: oneOf(footer.align, ALIGNS, fb.footer.align),
      sizePt: finite(footer.sizePt, fb.footer.sizePt, 1, 40),
    },
    verification: {
      qrPosition: oneOf(verification.qrPosition, ["bottom-left", "bottom-center", "bottom-right"], fb.verification.qrPosition),
      qrSizeMm: finite(verification.qrSizeMm, fb.verification.qrSizeMm, 10, 80),
    },
  };
}

/** Certificate values with every field of the right type ("" or null when missing). Never throws. */
export function normalizeRenderData(input: CertificateRenderData): CertificateRenderData {
  const data = (input && typeof input === "object" ? input : {}) as Partial<Record<keyof CertificateRenderData, unknown>>;
  const optional = (value: unknown) => (typeof value === "string" ? value : null);
  return {
    certificateUid: text(data.certificateUid, ""),
    studentName: text(data.studentName, ""),
    studentNumber: optional(data.studentNumber),
    certificateType: text(data.certificateType, ""),
    programName: text(data.programName, ""),
    classification: optional(data.classification),
    issueDate: optional(data.issueDate),
    graduationDate: optional(data.graduationDate),
    institutionName: text(data.institutionName, ""),
  };
}

/** The snapshot with a normalised design and well-formed institution and signatory entries. Never throws. */
export function normalizeSnapshot(input: RenderSnapshot): RenderSnapshot {
  const snapshot = (input && typeof input === "object" ? input : {}) as Partial<RenderSnapshot>;
  const institution = sectionOf(snapshot, "institution");
  const template = sectionOf(snapshot, "template");
  return {
    snapshotVersion: 1,
    template: { id: typeof template.id === "string" ? template.id : null, name: text(template.name, "") },
    design: normalizeDesign(snapshot.design),
    institution: {
      name: text(institution.name, ""),
      brandColor: typeof institution.brandColor === "string" ? institution.brandColor : null,
      logoAssetId: typeof institution.logoAssetId === "string" ? institution.logoAssetId : null,
      sealAssetId: typeof institution.sealAssetId === "string" ? institution.sealAssetId : null,
    },
    signatories: (Array.isArray(snapshot.signatories) ? snapshot.signatories : [])
      .filter((signatory) => signatory && typeof signatory === "object")
      .map((signatory) => ({
        name: text(signatory.name, ""),
        title: text(signatory.title, ""),
        signatureAssetId: typeof signatory.signatureAssetId === "string" ? signatory.signatureAssetId : null,
      })),
  };
}
