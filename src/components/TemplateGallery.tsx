"use client";

import { useEffect, useState } from "react";
import type { CertificateLayout } from "@/components/certificate/CertificateRenderer";
import { ScaledCertificate } from "@/components/certificate/ScaledCertificate";
import { useInstitutionProfile } from "@/context/InstitutionProfileContext";
import {
  getInstitutionTemplates,
  getSignatories,
  getTemplateOptions,
  type CertificateTemplateRecord,
  type Signatory,
  type TemplateOptions,
} from "@/lib/api";
import { buildPreviewSnapshot, type CertificateRenderData, type RenderSnapshot, type TemplateDesign } from "@/lib/certificateDesign";
import { certificatePdfFileName, exportCertificatePdf } from "@/lib/certificatePdf";

type NameLength = "short" | "long" | "veryLong";

const SHORT_NAME = "Ana Lee";
const VERY_LONG_NAME = "Maria-Fernanda Albuquerque Santos-Villareal de la Cruz";
const PREVIEW_SIGNATORY_COUNT = 2;

interface PreviewControls {
  nameLength: NameLength;
  pageSize: "" | TemplateDesign["page"]["size"];
  orientation: "" | TemplateDesign["page"]["orientation"];
}

/** Sample certificate values from the placeholder list, with the student name chosen by the preview control. */
function sampleData(options: TemplateOptions, nameLength: NameLength): CertificateRenderData {
  const sample = (name: string) => options.placeholders.find((placeholder) => placeholder.name === name)?.sample ?? "";
  const longName = sample("student_name");
  return {
    certificateUid: sample("certificate_id"),
    studentName: nameLength === "short" ? SHORT_NAME : nameLength === "veryLong" ? VERY_LONG_NAME : longName,
    studentNumber: sample("student_number"),
    certificateType: sample("certificate_type"),
    programName: sample("program_name"),
    classification: sample("classification"),
    issueDate: sample("issue_date"),
    graduationDate: sample("graduation_date"),
    institutionName: sample("institution_name"),
  };
}

/** Preview-only overrides of page size and orientation; nothing is saved. */
function withPageOverrides(design: TemplateDesign, controls: PreviewControls): TemplateDesign {
  if (!controls.pageSize && !controls.orientation) return design;
  return {
    ...design,
    page: {
      size: controls.pageSize || design.page.size,
      orientation: controls.orientation || design.page.orientation,
    },
  };
}

export function TemplateGallery() {
  const { profile, error: profileError } = useInstitutionProfile();
  const [options, setOptions] = useState<TemplateOptions | null>(null);
  const [signatories, setSignatories] = useState<Signatory[]>([]);
  const [templates, setTemplates] = useState<CertificateTemplateRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [controls, setControls] = useState<PreviewControls>({ nameLength: "long", pageSize: "", orientation: "" });

  useEffect(() => {
    let active = true;
    void Promise.all([getTemplateOptions(), getSignatories(), getInstitutionTemplates(true)])
      .then(([loadedOptions, loadedSignatories, loadedTemplates]) => {
        if (!active) return;
        setOptions(loadedOptions);
        setSignatories(loadedSignatories.signatories);
        setTemplates(loadedTemplates.templates);
      })
      .catch((requestError: unknown) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "Templates could not be loaded.");
      })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, []);

  const pageError = error || profileError;
  const ready = options && profile && !pageError;
  const data = options ? sampleData(options, controls.nameLength) : null;
  const previewSignatoryIds = signatories.slice(0, PREVIEW_SIGNATORY_COUNT).map((signatory) => signatory.id);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">Institution workspace</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">Templates</h1>
        <p className="mt-2 text-slate-600">How your certificates look. Previews use your logo, seal and signatories with sample student details.</p>

        <fieldset className="mt-6 grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
          <legend className="px-1 text-sm font-semibold text-slate-700">Preview controls (not saved)</legend>
          <label className="block text-sm font-medium text-slate-700" htmlFor="preview-name-length">
            Sample name length
            <select className="field" id="preview-name-length" onChange={(event) => setControls((current) => ({ ...current, nameLength: event.target.value as NameLength }))} value={controls.nameLength}>
              <option value="short">Short</option>
              <option value="long">Long</option>
              <option value="veryLong">Very long</option>
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700" htmlFor="preview-page-size">
            Page size
            <select className="field" id="preview-page-size" onChange={(event) => setControls((current) => ({ ...current, pageSize: event.target.value as PreviewControls["pageSize"] }))} value={controls.pageSize}>
              <option value="">As designed</option>
              <option value="A4">A4</option>
              <option value="LETTER">Letter</option>
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700" htmlFor="preview-orientation">
            Orientation
            <select className="field" id="preview-orientation" onChange={(event) => setControls((current) => ({ ...current, orientation: event.target.value as PreviewControls["orientation"] }))} value={controls.orientation}>
              <option value="">As designed</option>
              <option value="landscape">Landscape</option>
              <option value="portrait">Portrait</option>
            </select>
          </label>
        </fieldset>

        {pageError && <p className="mt-6 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{pageError}</p>}
        {isLoading && !pageError && <p className="mt-6 text-sm text-slate-600">Loading templates...</p>}
      </section>

      {ready && data && (
        <>
          <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
            <h2 className="text-xl font-semibold text-slate-950">Starter layouts</h2>
            <p className="mt-1 text-sm text-slate-600">Built-in designs. Classic is used for certificates when you have no default template.</p>
            <div className="mt-6 space-y-10">
              {options.starters.map((starter) => {
                const design = withPageOverrides({ ...starter.design, signatories: { ...starter.design.signatories, ids: previewSignatoryIds } }, controls);
                const snapshot = buildPreviewSnapshot(design, profile, signatories, { id: null, name: starter.name });
                return (
                  <TemplatePreview
                    data={data}
                    description={starter.description}
                    downloadable
                    key={starter.id}
                    name={starter.name}
                    snapshot={snapshot}
                  />
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
            <h2 className="text-xl font-semibold text-slate-950">Your templates</h2>
            {templates.length === 0 ? (
              <p className="mt-4 rounded-md bg-slate-50 p-5 text-sm text-slate-600 ring-1 ring-slate-200">You have not created any templates yet. The editor is coming next.</p>
            ) : (
              <div className="mt-6 space-y-10">
                {templates.map((template) => (
                  <TemplatePreview
                    badge={template.isDefault ? "Default" : template.isArchived ? "Archived" : undefined}
                    data={data}
                    key={template.id}
                    name={template.name}
                    snapshot={buildPreviewSnapshot(withPageOverrides(template.design, controls), profile, signatories, { id: template.id, name: template.name })}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function TemplatePreview({ name, description, badge, snapshot, data, downloadable = false }: {
  name: string;
  description?: string;
  badge?: "Default" | "Archived";
  snapshot: RenderSnapshot;
  data: CertificateRenderData;
  downloadable?: boolean;
}) {
  const [layout, setLayout] = useState<CertificateLayout | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState("");
  const [exportError, setExportError] = useState("");

  async function handleDownload() {
    setIsExporting(true);
    setExportMessage("");
    setExportError("");
    try {
      const result = await exportCertificatePdf({
        snapshot,
        data,
        fileName: certificatePdfFileName(`${name} sample`, data.certificateUid),
      });
      setExportMessage(`PDF downloaded (${(result.sizeBytes / 1024 / 1024).toFixed(1)} MB).`);
    } catch {
      setExportError("The PDF could not be generated. Please try again.");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <article>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
            {name}
            {badge && (
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge === "Default" ? "bg-teal-100 text-teal-800" : "bg-slate-200 text-slate-700"}`}>{badge}</span>
            )}
          </h3>
          {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
          <FitStatus layout={layout} />
        </div>
        {downloadable && (
          <button className="rounded-md border border-teal-600 px-3 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-50 disabled:opacity-60" disabled={isExporting} onClick={() => void handleDownload()} type="button">
            {isExporting ? "Preparing PDF..." : "Download sample PDF"}
          </button>
        )}
      </div>
      {exportMessage && <p className="mt-2 text-sm text-emerald-700" role="status">{exportMessage}</p>}
      {exportError && <p className="mt-2 text-sm text-red-700" role="alert">{exportError}</p>}
      <div className="mt-4 rounded-md bg-slate-100 p-4">
        <ScaledCertificate data={data} onLayout={setLayout} snapshot={snapshot} />
      </div>
    </article>
  );
}

/** Reports the renderer's auto-fit result, so a layout that needed shrinking (or still overflows) is visible. */
function FitStatus({ layout }: { layout: CertificateLayout | null }) {
  if (!layout) return null;
  if (layout.overflow) return <p className="mt-1 text-xs font-semibold text-red-700">Content does not fit the page, even with smaller text.</p>;
  if (layout.fontScale < 1) return <p className="mt-1 text-xs text-amber-800">Body text reduced to {Math.round(layout.fontScale * 100)}% to fit.</p>;
  return <p className="mt-1 text-xs text-slate-500">Fits the page.</p>;
}
