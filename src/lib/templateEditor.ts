// Pure logic for the template editor: the sections of the settings panel, the single immutable update helper,
// client-side validation mirroring the backend's design rules (the server stays the authority), mapping server
// messages back to sections, and the preview's sample data. No React here.

import type { NumericRange, StudentRecord, TemplateOptions } from "@/lib/api";
import type { CertificateRenderData, TemplateDesign } from "@/lib/certificateDesign";

export type DesignSectionKey = Exclude<keyof TemplateDesign, "schemaVersion">;
export type SectionId = "page" | "border" | "header" | "title" | "body" | "details" | "signatories" | "footer" | "verification";

export const SECTIONS: { id: SectionId; title: string }[] = [
  { id: "page", title: "Page and theme" },
  { id: "border", title: "Border and background" },
  { id: "header", title: "Header" },
  { id: "title", title: "Title" },
  { id: "body", title: "Body" },
  { id: "details", title: "Details" },
  { id: "signatories", title: "Signatories" },
  { id: "footer", title: "Footer" },
  { id: "verification", title: "Verification" },
];

const SECTION_OF_KEY: Record<DesignSectionKey, SectionId> = {
  page: "page",
  theme: "page",
  border: "border",
  background: "border",
  header: "header",
  title: "title",
  body: "body",
  fields: "details",
  signatories: "signatories",
  footer: "footer",
  verification: "verification",
};

/** Readable names for design fields, used in the summary of problems. */
const FIELD_LABELS: Record<string, string> = {
  "design.page.size": "Page size",
  "design.page.orientation": "Orientation",
  "design.theme.primaryColor": "Primary colour",
  "design.theme.accentColor": "Accent colour",
  "design.theme.textColor": "Text colour",
  "design.theme.mutedColor": "Muted colour",
  "design.theme.backgroundColor": "Background colour",
  "design.theme.headingFont": "Heading font",
  "design.theme.bodyFont": "Body font",
  "design.theme.nameFont": "Name font",
  "design.border.style": "Border style",
  "design.border.widthMm": "Border width",
  "design.border.color": "Border colour",
  "design.border.insetMm": "Border inset",
  "design.background.watermark": "Watermark",
  "design.background.watermarkOpacity": "Watermark opacity",
  "design.background.accentBar": "Accent bar",
  "design.header.logoPosition": "Logo position",
  "design.header.logoHeightMm": "Logo height",
  "design.header.institutionNameColor": "Institution name colour",
  "design.header.institutionNameSizePt": "Institution name size",
  "design.title.text": "Title text",
  "design.title.sizePt": "Title size",
  "design.title.align": "Title alignment",
  "design.title.color": "Title colour",
  "design.title.letterSpacing": "Title letter spacing",
  "design.body.text": "Body text",
  "design.body.sizePt": "Body size",
  "design.body.align": "Body alignment",
  "design.body.lineHeight": "Body line height",
  "design.body.nameSizePt": "Name size",
  "design.body.nameColor": "Name colour",
  "design.fields.dateFormat": "Date format",
  "design.signatories.ids": "Signatories",
  "design.signatories.lineStyle": "Signature line",
  "design.footer.text": "Footer text",
  "design.footer.align": "Footer alignment",
  "design.footer.sizePt": "Footer size",
  "design.verification.qrPosition": "QR position",
  "design.verification.qrSizeMm": "QR size",
};

export interface DesignIssue {
  /** The field path in the backend's format, e.g. "design.body.text". */
  path: string;
  section: SectionId | null;
  /** The problem without the field name, e.g. "must contain {{student_name}}". */
  message: string;
}

/** The single immutable update helper: a new design with `patch` applied to one of its sections. */
export function patchDesign<S extends DesignSectionKey>(design: TemplateDesign, section: S, patch: Partial<TemplateDesign[S]>): TemplateDesign {
  return { ...design, [section]: { ...design[section], ...patch } };
}

/**
 * The design as the preview and sample PDF draw it: a number field left empty or unreadable while typing (NaN)
 * shows its last saved value instead, so the renderer never receives NaN. Validation still sees the real design.
 */
export function renderableDesign(design: TemplateDesign, fallback: TemplateDesign): TemplateDesign {
  let result = design;
  for (const section of Object.keys(design) as (keyof TemplateDesign)[]) {
    const values = design[section];
    if (!values || typeof values !== "object" || Array.isArray(values)) continue;
    for (const [key, value] of Object.entries(values)) {
      if (typeof value === "number" && !Number.isFinite(value)) {
        const replacement = (fallback[section] as unknown as Record<string, unknown>)[key];
        result = { ...result, [section]: { ...(result[section] as object), [key]: replacement } };
      }
    }
  }
  return result;
}

export function sectionForPath(path: string): SectionId | null {
  const key = path.split(".")[1] as DesignSectionKey | undefined;
  return key && key in SECTION_OF_KEY ? SECTION_OF_KEY[key] : null;
}

/** "Body text must contain {{student_name}}" for the summary. */
export function describeIssue(issue: DesignIssue) {
  const label = FIELD_LABELS[issue.path] ?? (issue.path === "design" ? "The design" : issue.path.replace(/^design\./, ""));
  return `${label} ${issue.message}`;
}

/** The step of a slider for a range, so small ranges (opacity, line height) still move smoothly. */
export function rangeStep(range: NumericRange) {
  const span = range.max - range.min;
  if (span <= 1) return 0.01;
  if (span <= 10) return 0.1;
  return 1;
}

const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F]/;
const PLACEHOLDER_PATTERN = /\{\{([^{}]*)\}\}/g;
const HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Mirrors the backend's template name rule (1 to 60 characters, plain text). */
export const TEMPLATE_NAME_MAX_LENGTH = 60;

/** Mirrors the backend's limit on templates that are not archived; its error message is shown if it differs. */
export const MAX_ACTIVE_TEMPLATES = 20;

export function placeholdersIn(text: string) {
  return [...text.matchAll(PLACEHOLDER_PATTERN)].map((match) => match[1]);
}

function plainTextError(text: string) {
  if (CONTROL_CHARACTERS.test(text)) return "must not contain line breaks or control characters";
  if (/[<>]/.test(text)) return "must not contain < or >";
  return "";
}

/** The template name's problem, or "" when it is valid. */
export function validateTemplateName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "Enter a name for the template.";
  if (trimmed.length > TEMPLATE_NAME_MAX_LENGTH) return `The name must be at most ${TEMPLATE_NAME_MAX_LENGTH} characters.`;
  const textError = plainTextError(trimmed);
  return textError ? `The name ${textError}.` : "";
}

/**
 * Checks a design against the same rules as the backend (format version 1), using the fonts, date formats,
 * placeholders and limits from GET /api/templates/options. `activeSignatoryIds`, when given, also flags
 * signatories that are no longer active, which the server would refuse on save.
 */
export function validateDesign(design: TemplateDesign, options: TemplateOptions, activeSignatoryIds?: string[]): DesignIssue[] {
  const issues: DesignIssue[] = [];
  const { limits } = options;
  const add = (path: string, message: string) => issues.push({ path, section: sectionForPath(path), message });

  const range = (path: string, value: number, limit: NumericRange) => {
    if (typeof value !== "number" || !Number.isFinite(value)) add(path, `must be a number from ${limit.min} to ${limit.max}`);
    else if (value < limit.min || value > limit.max) add(path, `must be from ${limit.min} to ${limit.max}`);
  };
  const hex = (path: string, value: string) => { if (!HEX_PATTERN.test(value)) add(path, "must be a colour in the form #RRGGBB"); };
  const oneOf = (path: string, value: string, allowed: readonly string[], description: string) => {
    if (!allowed.includes(value)) add(path, `must be ${description}`);
  };

  const allowedPlaceholders = options.placeholders.map((placeholder) => placeholder.name);
  const text = (path: string, value: string, maxLength: number) => {
    if (value.length > maxLength) add(path, `must be at most ${maxLength} characters`);
    const plainError = plainTextError(value);
    if (plainError) add(path, plainError);
    for (const name of placeholdersIn(value)) {
      if (!allowedPlaceholders.includes(name)) add(path, `uses an unknown placeholder {{${name}}}. Use "Insert placeholder" for the allowed ones.`);
    }
    if (/[{}]/.test(value.replace(PLACEHOLDER_PATTERN, ""))) add(path, "has an unmatched { or }. Placeholders look like {{student_name}}");
  };

  const fontIds = options.fonts.map((font) => font.id);
  const tokens = ["primary", "accent", "text", "muted"];
  const aligns = ["left", "center", "right"];

  oneOf("design.page.size", design.page.size, ["A4", "LETTER"], "A4 or Letter");
  oneOf("design.page.orientation", design.page.orientation, ["landscape", "portrait"], "landscape or portrait");

  hex("design.theme.primaryColor", design.theme.primaryColor);
  hex("design.theme.accentColor", design.theme.accentColor);
  hex("design.theme.textColor", design.theme.textColor);
  hex("design.theme.mutedColor", design.theme.mutedColor);
  hex("design.theme.backgroundColor", design.theme.backgroundColor);
  oneOf("design.theme.headingFont", design.theme.headingFont, fontIds, "one of the supported fonts");
  oneOf("design.theme.bodyFont", design.theme.bodyFont, fontIds, "one of the supported fonts");
  oneOf("design.theme.nameFont", design.theme.nameFont, fontIds, "one of the supported fonts");

  oneOf("design.border.style", design.border.style, ["none", "single", "double", "frame"], "none, single, double or frame");
  range("design.border.widthMm", design.border.widthMm, limits.borderWidthMm);
  oneOf("design.border.color", design.border.color, tokens, "one of primary, accent, text, muted");
  range("design.border.insetMm", design.border.insetMm, limits.borderInsetMm);

  oneOf("design.background.watermark", design.background.watermark, ["none", "logo", "seal"], "none, logo or seal");
  range("design.background.watermarkOpacity", design.background.watermarkOpacity, limits.watermarkOpacity);
  oneOf("design.background.accentBar", design.background.accentBar, ["none", "top", "left"], "none, top or left");

  oneOf("design.header.logoPosition", design.header.logoPosition, aligns, "left, center or right");
  range("design.header.logoHeightMm", design.header.logoHeightMm, limits.logoHeightMm);
  oneOf("design.header.institutionNameColor", design.header.institutionNameColor, tokens, "one of primary, accent, text, muted");
  range("design.header.institutionNameSizePt", design.header.institutionNameSizePt, limits.institutionNameSizePt);

  text("design.title.text", design.title.text, limits.titleTextMaxLength);
  range("design.title.sizePt", design.title.sizePt, limits.titleSizePt);
  oneOf("design.title.align", design.title.align, aligns, "left, center or right");
  oneOf("design.title.color", design.title.color, tokens, "one of primary, accent, text, muted");
  range("design.title.letterSpacing", design.title.letterSpacing, limits.titleLetterSpacing);

  text("design.body.text", design.body.text, limits.bodyTextMaxLength);
  if (!placeholdersIn(design.body.text).includes("student_name")) add("design.body.text", "must contain {{student_name}}");
  range("design.body.sizePt", design.body.sizePt, limits.bodySizePt);
  oneOf("design.body.align", design.body.align, aligns, "left, center or right");
  range("design.body.lineHeight", design.body.lineHeight, limits.bodyLineHeight);
  range("design.body.nameSizePt", design.body.nameSizePt, limits.nameSizePt);
  oneOf("design.body.nameColor", design.body.nameColor, tokens, "one of primary, accent, text, muted");

  oneOf("design.fields.dateFormat", design.fields.dateFormat, options.dateFormats.map((format) => format.id), "one of the supported date formats");

  const ids = design.signatories.ids;
  if (ids.length > limits.maxSignatories) add("design.signatories.ids", `can list at most ${limits.maxSignatories} signatories`);
  if (new Set(ids).size !== ids.length) add("design.signatories.ids", "must not list the same signatory twice");
  if (ids.some((id) => !UUID_PATTERN.test(id))) add("design.signatories.ids", "must only list signatory ids");
  if (activeSignatoryIds && ids.some((id) => !activeSignatoryIds.includes(id))) {
    add("design.signatories.ids", "include a signatory who is no longer active. Remove it before saving.");
  }
  oneOf("design.signatories.lineStyle", design.signatories.lineStyle, ["line", "none"], "line or none");

  text("design.footer.text", design.footer.text, limits.footerTextMaxLength);
  oneOf("design.footer.align", design.footer.align, aligns, "left, center or right");
  range("design.footer.sizePt", design.footer.sizePt, limits.footerSizePt);

  oneOf("design.verification.qrPosition", design.verification.qrPosition, ["bottom-left", "bottom-center", "bottom-right"], "bottom left, bottom centre or bottom right");
  range("design.verification.qrSizeMm", design.verification.qrSizeMm, limits.qrSizeMm);

  const bytes = new TextEncoder().encode(JSON.stringify(design)).length;
  if (bytes > limits.maxDesignBytes) add("design", `must be at most ${limits.maxDesignBytes / 1024} KB when saved (this one is ${(bytes / 1024).toFixed(1)} KB)`);

  return issues;
}

export interface ServerProblems {
  issues: DesignIssue[];
  /** A problem with the template name, such as a duplicate. */
  nameError: string;
  /** Anything that belongs to no field, such as the template limit. */
  general: string[];
}

/**
 * Maps a backend error message to the editor: "Invalid design: design.body.text must ...; design.title..."
 * becomes one issue per field path, signatory messages go to the Signatories section, name messages to the
 * name field, and anything else to the summary. Never shows raw JSON.
 */
export function problemsFromServerMessage(message: string): ServerProblems {
  const problems: ServerProblems = { issues: [], nameError: "", general: [] };
  // "design.signatories.ids.0" names one entry of a list; the editor shows it on the list's field.
  const fieldPath = (path: string) => path.replace(/(\.\d+)+$/, "");
  const designPrefix = "Invalid design: ";
  if (message.startsWith(designPrefix)) {
    for (const part of message.slice(designPrefix.length).split(/;\s+(?=design\b|and \d+ more)/)) {
      const match = /^(design(?:\.[A-Za-z0-9_]+)*)\s+([\s\S]+)$/.exec(part.trim());
      if (match) problems.issues.push({ path: fieldPath(match[1]), section: sectionForPath(match[1]), message: match[2] });
      else problems.general.push(part.trim());
    }
    return problems;
  }
  const fieldMatch = /^(design(?:\.[A-Za-z0-9_]+)+)\s+([\s\S]+)$/.exec(message);
  if (fieldMatch) {
    problems.issues.push({ path: fieldPath(fieldMatch[1]), section: sectionForPath(fieldMatch[1]), message: fieldMatch[2] });
  } else if (/^Signatory\b/.test(message)) {
    problems.issues.push({ path: "design.signatories.ids", section: "signatories", message });
  } else if (/^name\b/.test(message) || /template with this name/i.test(message)) {
    problems.nameError = /^name\b/.test(message) ? `The ${message}.` : `${message}.`;
  } else {
    problems.general.push(message);
  }
  return problems;
}

export type NameLength = "short" | "long" | "veryLong";

export const SHORT_SAMPLE_NAME = "Ana Lee";
export const VERY_LONG_SAMPLE_NAME = "Maria-Fernanda Albuquerque Santos-Villareal de la Cruz";

/** Sample certificate values from the placeholder list; the name length is chosen by the preview controls. */
export function sampleRenderData(options: TemplateOptions, nameLength: NameLength): CertificateRenderData {
  const sample = (name: string) => options.placeholders.find((placeholder) => placeholder.name === name)?.sample ?? "";
  return {
    certificateUid: sample("certificate_id"),
    studentName: nameLength === "short" ? SHORT_SAMPLE_NAME : nameLength === "veryLong" ? VERY_LONG_SAMPLE_NAME : sample("student_name"),
    studentNumber: sample("student_number"),
    certificateType: sample("certificate_type"),
    programName: sample("program_name"),
    classification: sample("classification"),
    issueDate: sample("issue_date"),
    graduationDate: sample("graduation_date"),
    institutionName: sample("institution_name"),
  };
}

/** One of the institution's students with sample values for everything else. Nothing is saved. */
export function studentRenderData(options: TemplateOptions, student: Pick<StudentRecord, "fullName" | "studentNumber">): CertificateRenderData {
  return { ...sampleRenderData(options, "long"), studentName: student.fullName, studentNumber: student.studentNumber };
}

/** Today's date as YYYY-MM-DD in the viewer's time zone, for the date format examples. */
export function todayIsoDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** How many active signatories a starter starts with in previews and new templates. */
export const STARTER_SIGNATORY_COUNT = 2;

/** A copy of a starter's design with the institution's first active signatories filled in. */
export function designFromStarter(design: TemplateDesign, activeSignatoryIds: string[], maxSignatories: number): TemplateDesign {
  return patchDesign(design, "signatories", { ids: activeSignatoryIds.slice(0, Math.min(STARTER_SIGNATORY_COUNT, maxSignatories)) });
}
