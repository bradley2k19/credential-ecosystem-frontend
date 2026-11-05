"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { AssetImage } from "@/components/AssetImage";
import { ChoiceField, ColorField, FieldMessages, FontPicker, PlaceholderTextField, RangeField, SelectField, TokenField, ToggleField } from "@/components/templates/EditorControls";
import type { InstitutionProfileDetails, Signatory, TemplateOptions } from "@/lib/api";
import { formatDesignDate, type Align, type ColorToken, type TemplateDesign } from "@/lib/certificateDesign";
import { todayIsoDate, type DesignSectionKey, type SectionId } from "@/lib/templateEditor";

export interface SectionProps {
  design: TemplateDesign;
  update: <S extends DesignSectionKey>(section: S, patch: Partial<TemplateDesign[S]>) => void;
  /** Validation messages (client and server) for one field path, e.g. "design.body.text". */
  messagesFor: (path: string) => string[];
  options: TemplateOptions;
  profile: InstitutionProfileDetails;
  signatories: Signatory[];
}

const ALIGN_CHOICES: { value: Align; label: string }[] = [
  { value: "left", label: "Left" },
  { value: "center", label: "Centre" },
  { value: "right", label: "Right" },
];

const PROFILE_LINK = "/institution/profile";

function colorsOf(design: TemplateDesign): Record<ColorToken, string> {
  return { primary: design.theme.primaryColor, accent: design.theme.accentColor, text: design.theme.textColor, muted: design.theme.mutedColor };
}

function ProfileHint({ children }: { children: ReactNode }) {
  return <>{children} <Link className="font-semibold text-teal-700 underline hover:text-teal-900" href={PROFILE_LINK}>Go to Profile</Link></>;
}

/** A collapsible settings section; its header shows an error dot when any field inside is invalid. */
export function SettingsSection({ id, title, isOpen, hasErrors, onToggle, children }: {
  id: SectionId;
  title: string;
  isOpen: boolean;
  hasErrors: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-slate-200 last:border-b-0" id={`section-${id}`}>
      <h2>
        <button
          aria-controls={`section-${id}-content`}
          aria-expanded={isOpen}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold text-slate-900 hover:bg-slate-50"
          onClick={onToggle}
          type="button"
        >
          <span className="flex items-center gap-2">
            {title}
            {hasErrors && <span aria-label="Contains a problem" className="h-2 w-2 rounded-full bg-red-600" role="img" />}
          </span>
          <span aria-hidden="true" className={`text-xs text-slate-500 transition ${isOpen ? "rotate-180" : ""}`}>▾</span>
        </button>
      </h2>
      <div className={isOpen ? "space-y-4 px-4 pb-5 pt-1" : "hidden"} id={`section-${id}-content`}>{children}</div>
    </section>
  );
}

export function PageThemeSection({ design, update, messagesFor, options, profile }: SectionProps) {
  const brand = profile.brandColor;
  const brandButton = (key: "primaryColor" | "accentColor") => (
    <button
      className="rounded-md border border-slate-300 px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      disabled={!brand}
      onClick={() => brand && update("theme", { [key]: brand.toUpperCase() } as Partial<TemplateDesign["theme"]>)}
      title={brand ? `Use ${brand.toUpperCase()}` : "Set a brand colour in Profile first"}
      type="button"
    >
      Use my brand colour
    </button>
  );
  const fontPicker = (key: "headingFont" | "bodyFont" | "nameFont", label: string) => (
    <FontPicker fonts={options.fonts} label={label} messages={messagesFor(`design.theme.${key}`)} onChange={(fontId) => update("theme", { [key]: fontId } as Partial<TemplateDesign["theme"]>)} value={design.theme[key]} />
  );

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <SelectField choices={[{ value: "A4", label: "A4" }, { value: "LETTER", label: "Letter" }]} label="Page size" messages={messagesFor("design.page.size")} onChange={(size) => update("page", { size })} value={design.page.size} />
        <SelectField choices={[{ value: "landscape", label: "Landscape" }, { value: "portrait", label: "Portrait" }]} label="Orientation" messages={messagesFor("design.page.orientation")} onChange={(orientation) => update("page", { orientation })} value={design.page.orientation} />
      </div>
      <ColorField action={brandButton("primaryColor")} label="Primary colour" messages={messagesFor("design.theme.primaryColor")} onChange={(primaryColor) => update("theme", { primaryColor })} value={design.theme.primaryColor} />
      <ColorField action={brandButton("accentColor")} label="Accent colour" messages={messagesFor("design.theme.accentColor")} onChange={(accentColor) => update("theme", { accentColor })} value={design.theme.accentColor} />
      {!brand && <p className="-mt-2 text-xs text-amber-800"><ProfileHint>You have not set a brand colour yet.</ProfileHint></p>}
      <ColorField label="Text colour" messages={messagesFor("design.theme.textColor")} onChange={(textColor) => update("theme", { textColor })} value={design.theme.textColor} />
      <ColorField label="Muted colour" messages={messagesFor("design.theme.mutedColor")} onChange={(mutedColor) => update("theme", { mutedColor })} value={design.theme.mutedColor} />
      <ColorField label="Background colour" messages={messagesFor("design.theme.backgroundColor")} onChange={(backgroundColor) => update("theme", { backgroundColor })} value={design.theme.backgroundColor} />
      {fontPicker("headingFont", "Heading font")}
      {fontPicker("bodyFont", "Body font")}
      {fontPicker("nameFont", "Name font")}
    </>
  );
}

export function BorderBackgroundSection({ design, update, messagesFor, options, profile }: SectionProps) {
  const { border, background } = design;
  const watermarkMissing = (background.watermark === "logo" && !profile.logoUrl) || (background.watermark === "seal" && !profile.sealUrl);
  return (
    <>
      <SelectField
        choices={[{ value: "none", label: "None" }, { value: "single", label: "Single line" }, { value: "double", label: "Double line" }, { value: "frame", label: "Frame with corners" }]}
        label="Border style"
        messages={messagesFor("design.border.style")}
        onChange={(style) => update("border", { style })}
        value={border.style}
      />
      {border.style !== "none" && (
        <>
          <RangeField label="Border width" messages={messagesFor("design.border.widthMm")} onChange={(widthMm) => update("border", { widthMm })} range={options.limits.borderWidthMm} unit="mm" value={border.widthMm} />
          <TokenField colors={colorsOf(design)} label="Border colour" messages={messagesFor("design.border.color")} onChange={(color) => update("border", { color })} value={border.color} />
        </>
      )}
      <RangeField label="Border inset from the page edge" messages={messagesFor("design.border.insetMm")} onChange={(insetMm) => update("border", { insetMm })} range={options.limits.borderInsetMm} unit="mm" value={border.insetMm} />
      <ChoiceField
        choices={[{ value: "none", label: "None" }, { value: "logo", label: "Logo" }, { value: "seal", label: "Seal" }]}
        label="Watermark"
        messages={messagesFor("design.background.watermark")}
        onChange={(watermark) => update("background", { watermark })}
        value={background.watermark}
      />
      {watermarkMissing && <p className="-mt-2 text-xs text-amber-800"><ProfileHint>You have not uploaded a {background.watermark} yet, so no watermark is shown.</ProfileHint></p>}
      {background.watermark !== "none" && (
        <RangeField label="Watermark opacity" messages={messagesFor("design.background.watermarkOpacity")} onChange={(watermarkOpacity) => update("background", { watermarkOpacity })} range={options.limits.watermarkOpacity} value={background.watermarkOpacity} />
      )}
      <ChoiceField
        choices={[{ value: "none", label: "None" }, { value: "top", label: "Top" }, { value: "left", label: "Left" }]}
        label="Accent bar"
        messages={messagesFor("design.background.accentBar")}
        onChange={(accentBar) => update("background", { accentBar })}
        value={background.accentBar}
      />
    </>
  );
}

export function HeaderSection({ design, update, messagesFor, options, profile }: SectionProps) {
  const { header } = design;
  return (
    <>
      <ToggleField
        checked={header.showLogo}
        hint={!profile.logoUrl ? <ProfileHint>You have not uploaded a logo yet.</ProfileHint> : undefined}
        label="Show logo"
        onChange={(showLogo) => update("header", { showLogo })}
      />
      <ChoiceField choices={ALIGN_CHOICES} label="Logo position" messages={messagesFor("design.header.logoPosition")} onChange={(logoPosition) => update("header", { logoPosition })} value={header.logoPosition} />
      <RangeField label="Logo and seal height" messages={messagesFor("design.header.logoHeightMm")} onChange={(logoHeightMm) => update("header", { logoHeightMm })} range={options.limits.logoHeightMm} unit="mm" value={header.logoHeightMm} />
      <ToggleField
        checked={header.showSeal}
        hint={!profile.sealUrl ? <ProfileHint>You have not uploaded a seal yet.</ProfileHint> : undefined}
        label="Show seal (opposite the logo)"
        onChange={(showSeal) => update("header", { showSeal })}
      />
      <ToggleField checked={header.showInstitutionName} label="Show institution name" onChange={(showInstitutionName) => update("header", { showInstitutionName })} />
      {header.showInstitutionName && (
        <>
          <TokenField colors={colorsOf(design)} label="Institution name colour" messages={messagesFor("design.header.institutionNameColor")} onChange={(institutionNameColor) => update("header", { institutionNameColor })} value={header.institutionNameColor} />
          <RangeField label="Institution name size" messages={messagesFor("design.header.institutionNameSizePt")} onChange={(institutionNameSizePt) => update("header", { institutionNameSizePt })} range={options.limits.institutionNameSizePt} unit="pt" value={header.institutionNameSizePt} />
        </>
      )}
    </>
  );
}

export function TitleSection({ design, update, messagesFor, options }: SectionProps) {
  const { title } = design;
  return (
    <>
      <PlaceholderTextField label="Title text" maxLength={options.limits.titleTextMaxLength} messages={messagesFor("design.title.text")} onChange={(text) => update("title", { text })} placeholders={options.placeholders} value={title.text} />
      <RangeField label="Title size" messages={messagesFor("design.title.sizePt")} onChange={(sizePt) => update("title", { sizePt })} range={options.limits.titleSizePt} unit="pt" value={title.sizePt} />
      <ChoiceField choices={ALIGN_CHOICES} label="Title alignment" messages={messagesFor("design.title.align")} onChange={(align) => update("title", { align })} value={title.align} />
      <TokenField colors={colorsOf(design)} label="Title colour" messages={messagesFor("design.title.color")} onChange={(color) => update("title", { color })} value={title.color} />
      <RangeField label="Letter spacing" messages={messagesFor("design.title.letterSpacing")} onChange={(letterSpacing) => update("title", { letterSpacing })} range={options.limits.titleLetterSpacing} unit="pt" value={title.letterSpacing} />
      <ToggleField checked={title.uppercase} label="Capital letters" onChange={(uppercase) => update("title", { uppercase })} />
    </>
  );
}

export function BodySection({ design, update, messagesFor, options }: SectionProps) {
  const { body } = design;
  return (
    <>
      <PlaceholderTextField label="Body text" maxLength={options.limits.bodyTextMaxLength} messages={messagesFor("design.body.text")} multiline onChange={(text) => update("body", { text })} placeholders={options.placeholders} value={body.text} />
      <p className="-mt-2 text-xs text-slate-500">The first {"{{student_name}}"} is shown on its own line in the name font.</p>
      <RangeField label="Body size" messages={messagesFor("design.body.sizePt")} onChange={(sizePt) => update("body", { sizePt })} range={options.limits.bodySizePt} unit="pt" value={body.sizePt} />
      <ChoiceField choices={ALIGN_CHOICES} label="Body alignment" messages={messagesFor("design.body.align")} onChange={(align) => update("body", { align })} value={body.align} />
      <RangeField label="Line height" messages={messagesFor("design.body.lineHeight")} onChange={(lineHeight) => update("body", { lineHeight })} range={options.limits.bodyLineHeight} value={body.lineHeight} />
      <RangeField label="Name size" messages={messagesFor("design.body.nameSizePt")} onChange={(nameSizePt) => update("body", { nameSizePt })} range={options.limits.nameSizePt} unit="pt" value={body.nameSizePt} />
      <TokenField colors={colorsOf(design)} label="Name colour" messages={messagesFor("design.body.nameColor")} onChange={(nameColor) => update("body", { nameColor })} value={body.nameColor} />
    </>
  );
}

export function DetailsSection({ design, update, messagesFor, options }: SectionProps) {
  const { fields } = design;
  const today = todayIsoDate();
  return (
    <>
      <fieldset>
        <legend className="block text-sm font-medium text-slate-700">Date format</legend>
        <div className="mt-1 space-y-1" role="radiogroup">
          {options.dateFormats.map((format) => (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700" key={format.id}>
              <input checked={fields.dateFormat === format.id} className="accent-teal-700" name="date-format" onChange={() => update("fields", { dateFormat: format.id })} type="radio" />
              <span className="font-mono text-xs text-slate-500">{format.id}</span>
              <span>{formatDesignDate(today, format.id)}</span>
            </label>
          ))}
        </div>
        <FieldMessages messages={messagesFor("design.fields.dateFormat")} />
      </fieldset>
      <ToggleField checked={fields.showClassification} label="Show classification" onChange={(showClassification) => update("fields", { showClassification })} />
      <ToggleField checked={fields.showGraduationDate} label="Show graduation date" onChange={(showGraduationDate) => update("fields", { showGraduationDate })} />
      <ToggleField checked={fields.showStudentNumber} label="Show student number" onChange={(showStudentNumber) => update("fields", { showStudentNumber })} />
    </>
  );
}

export function SignatoriesSection({ design, update, messagesFor, options, signatories }: SectionProps) {
  const ids = design.signatories.ids;
  const max = options.limits.maxSignatories;
  const byId = new Map(signatories.map((signatory) => [signatory.id, signatory]));
  const available = signatories.filter((signatory) => !ids.includes(signatory.id));
  const atMax = ids.length >= max;

  const setIds = (next: string[]) => update("signatories", { ids: next });
  const move = (index: number, direction: -1 | 1) => {
    const next = [...ids];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    setIds(next);
  };

  return (
    <>
      <p className="text-xs text-slate-600">Up to {max} signatories, shown in this order. <Link className="font-semibold text-teal-700 underline hover:text-teal-900" href={PROFILE_LINK}>Manage signatories in Profile</Link></p>
      {signatories.length === 0 && ids.length === 0 && <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">You have no active signatories yet.</p>}
      <ul className="space-y-2">
        {ids.map((id, index) => {
          const signatory = byId.get(id);
          if (!signatory) {
            return (
              <li className="flex items-center justify-between gap-2 rounded-md border border-red-300 bg-red-50 p-2" key={id}>
                <div>
                  <p className="text-sm font-semibold text-red-900">No longer active</p>
                  <p className="text-xs text-red-800">This signatory was archived. Remove it before saving.</p>
                </div>
                <button className="rounded-md border border-red-400 bg-white px-2 py-1 text-xs font-semibold text-red-800 hover:bg-red-100" onClick={() => setIds(ids.filter((item) => item !== id))} type="button">Remove</button>
              </li>
            );
          }
          return (
            <li className="flex items-center gap-2 rounded-md border border-teal-200 bg-teal-50/50 p-2" key={id}>
              <input aria-label={`Include ${signatory.name}`} checked className="h-4 w-4 accent-teal-700" onChange={() => setIds(ids.filter((item) => item !== id))} type="checkbox" />
              <SignatoryInfo signatory={signatory} />
              <div className="flex shrink-0 gap-1">
                <button aria-label={`Move ${signatory.name} up`} className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-xs disabled:opacity-40" disabled={index === 0} onClick={() => move(index, -1)} type="button">↑</button>
                <button aria-label={`Move ${signatory.name} down`} className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-xs disabled:opacity-40" disabled={index === ids.length - 1} onClick={() => move(index, 1)} type="button">↓</button>
              </div>
            </li>
          );
        })}
        {available.map((signatory) => (
          <li className="flex items-center gap-2 rounded-md border border-slate-200 p-2" key={signatory.id}>
            <input aria-label={`Include ${signatory.name}`} checked={false} className="h-4 w-4 accent-teal-700" disabled={atMax} onChange={() => setIds([...ids, signatory.id])} type="checkbox" />
            <SignatoryInfo signatory={signatory} />
          </li>
        ))}
      </ul>
      {atMax && available.length > 0 && <p className="text-xs text-slate-500">The maximum of {max} is reached. Untick one to choose another.</p>}
      <FieldMessages messages={messagesFor("design.signatories.ids")} />
      <ToggleField checked={design.signatories.showTitles} label="Show titles" onChange={(showTitles) => update("signatories", { showTitles })} />
      <ChoiceField
        choices={[{ value: "line", label: "Signature line" }, { value: "none", label: "No line" }]}
        label="Line style"
        messages={messagesFor("design.signatories.lineStyle")}
        onChange={(lineStyle) => update("signatories", { lineStyle })}
        value={design.signatories.lineStyle}
      />
    </>
  );
}

function SignatoryInfo({ signatory }: { signatory: Signatory }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <div className="flex h-8 w-14 shrink-0 items-center justify-center rounded bg-white ring-1 ring-slate-200">
        {signatory.signatureUrl
          ? <AssetImage alt={`Signature of ${signatory.name}`} className="max-h-7 max-w-12 object-contain" path={signatory.signatureUrl} />
          : <span className="text-[10px] text-slate-400">No signature</span>}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-900">{signatory.name}</p>
        <p className="truncate text-xs text-slate-600">{signatory.title}</p>
      </div>
    </div>
  );
}

export function FooterSection({ design, update, messagesFor, options }: SectionProps) {
  const { footer } = design;
  return (
    <>
      <PlaceholderTextField label="Footer text" maxLength={options.limits.footerTextMaxLength} messages={messagesFor("design.footer.text")} onChange={(text) => update("footer", { text })} placeholders={options.placeholders} value={footer.text} />
      <ChoiceField choices={ALIGN_CHOICES} label="Footer alignment" messages={messagesFor("design.footer.align")} onChange={(align) => update("footer", { align })} value={footer.align} />
      <RangeField label="Footer size" messages={messagesFor("design.footer.sizePt")} onChange={(sizePt) => update("footer", { sizePt })} range={options.limits.footerSizePt} unit="pt" value={footer.sizePt} />
    </>
  );
}

export function VerificationSection({ design, update, messagesFor, options }: SectionProps) {
  const { verification } = design;
  return (
    <>
      <p className="rounded-md border border-sky-200 bg-sky-50 p-3 text-xs leading-5 text-sky-950">
        The QR code, certificate ID and verification link are always included on every certificate. They cannot be removed.
      </p>
      <ChoiceField
        choices={[{ value: "bottom-left", label: "Bottom left" }, { value: "bottom-center", label: "Bottom centre" }, { value: "bottom-right", label: "Bottom right" }]}
        label="QR position"
        messages={messagesFor("design.verification.qrPosition")}
        onChange={(qrPosition) => update("verification", { qrPosition })}
        value={verification.qrPosition}
      />
      <RangeField label="QR size" messages={messagesFor("design.verification.qrSizeMm")} onChange={(qrSizeMm) => update("verification", { qrSizeMm })} range={options.limits.qrSizeMm} unit="mm" value={verification.qrSizeMm} />
    </>
  );
}

/** The fields of one settings section. */
export function SectionContent({ id, ...props }: SectionProps & { id: SectionId }) {
  switch (id) {
    case "page": return <PageThemeSection {...props} />;
    case "border": return <BorderBackgroundSection {...props} />;
    case "header": return <HeaderSection {...props} />;
    case "title": return <TitleSection {...props} />;
    case "body": return <BodySection {...props} />;
    case "details": return <DetailsSection {...props} />;
    case "signatories": return <SignatoriesSection {...props} />;
    case "footer": return <FooterSection {...props} />;
    case "verification": return <VerificationSection {...props} />;
  }
}
