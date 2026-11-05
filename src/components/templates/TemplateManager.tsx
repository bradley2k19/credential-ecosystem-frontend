"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CertificateExportFeedback, useCertificateExport } from "@/components/certificate/CertificateExport";
import type { CertificateLayout } from "@/components/certificate/CertificateRenderer";
import { ScaledCertificate } from "@/components/certificate/ScaledCertificate";
import { CloneTemplateDialog, ConfirmActionDialog, NewTemplateDialog } from "@/components/templates/TemplateDialogs";
import { useInstitutionProfile } from "@/context/InstitutionProfileContext";
import {
  getInstitutionTemplates,
  getSignatories,
  getTemplateOptions,
  setDefaultInstitutionTemplate,
  setInstitutionTemplateArchived,
  type CertificateTemplateRecord,
  type InstitutionProfileDetails,
  type Signatory,
  type TemplateOptions,
} from "@/lib/api";
import { buildPreviewSnapshot, type CertificateRenderData, type RenderSnapshot, type TemplateDesign } from "@/lib/certificateDesign";
import { certificatePdfFileName } from "@/lib/certificatePdf";
import { MAX_ACTIVE_TEMPLATES, designFromStarter, sampleRenderData, type NameLength } from "@/lib/templateEditor";

type StatusAction = "setDefault" | "clearDefault" | "archive" | "unarchive";

interface PreviewControls {
  nameLength: NameLength;
  pageSize: "" | TemplateDesign["page"]["size"];
  orientation: "" | TemplateDesign["page"]["orientation"];
}

/** Preview-only overrides of page size and orientation for the starter gallery; nothing is saved. */
function withPageOverrides(design: TemplateDesign, controls: PreviewControls): TemplateDesign {
  if (!controls.pageSize && !controls.orientation) return design;
  return { ...design, page: { size: controls.pageSize || design.page.size, orientation: controls.orientation || design.page.orientation } };
}

function formatUpdated(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const ACTION_TEXT: Record<StatusAction, { title: string; message: (name: string) => string; confirmLabel: string; done: (name: string) => string; tone?: "danger" }> = {
  setDefault: {
    title: "Set as default?",
    message: (name) => `"${name}" will be used for the certificates you issue from now on.`,
    confirmLabel: "Set as default",
    done: (name) => `"${name}" is now your default template.`,
  },
  clearDefault: {
    title: "Remove the default?",
    message: (name) => `"${name}" will no longer be the default. Certificates will use the Classic starter layout until you choose another default.`,
    confirmLabel: "Remove default",
    done: () => "You have no default template now. Certificates use the Classic starter layout.",
  },
  archive: {
    title: "Archive this template?",
    message: (name) => `"${name}" will be hidden and cannot be used for new certificates. Certificates already issued are not affected. You can unarchive it later.`,
    confirmLabel: "Archive",
    done: (name) => `"${name}" was archived.`,
    tone: "danger",
  },
  unarchive: {
    title: "Unarchive this template?",
    message: (name) => `"${name}" will be available again for editing and for new certificates.`,
    confirmLabel: "Unarchive",
    done: (name) => `"${name}" was unarchived.`,
  },
};

/** The Templates page: the institution's templates with their actions, then the starter layouts. */
export function TemplateManager() {
  const { profile, error: profileError } = useInstitutionProfile();
  const [options, setOptions] = useState<TemplateOptions | null>(null);
  const [signatories, setSignatories] = useState<Signatory[]>([]);
  const [templates, setTemplates] = useState<CertificateTemplateRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [notice, setNotice] = useState("");
  const [pendingAction, setPendingAction] = useState<{ action: StatusAction; template: CertificateTemplateRecord } | null>(null);
  const [cloneSource, setCloneSource] = useState<CertificateTemplateRecord | null>(null);
  const [isChoosingStarter, setIsChoosingStarter] = useState(false);
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
        if (active) setLoadError(requestError instanceof Error ? requestError.message : "Templates could not be loaded.");
      })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, []);

  async function reloadTemplates() {
    setTemplates((await getInstitutionTemplates(true)).templates);
  }

  async function runStatusAction(action: StatusAction, template: CertificateTemplateRecord) {
    if (action === "setDefault") await setDefaultInstitutionTemplate(template.id);
    else if (action === "clearDefault") await setDefaultInstitutionTemplate(null);
    else await setInstitutionTemplateArchived(template.id, action === "archive");
    setNotice(ACTION_TEXT[action].done(template.name));
    await reloadTemplates();
  }

  const pageError = loadError || profileError;
  const activeCount = templates.filter((template) => !template.isArchived).length;
  const archivedCount = templates.length - activeCount;
  const atLimit = activeCount >= MAX_ACTIVE_TEMPLATES;
  const shown = templates.filter((template) => showArchived || !template.isArchived);
  const activeSignatoryIds = signatories.map((signatory) => signatory.id);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">Institution workspace</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">Templates</h1>
            <p className="mt-2 text-slate-600">Design how your certificates look. Previews use your logo, seal and signatories with sample student details.</p>
          </div>
          <div className="text-right">
            <button
              className="rounded-md bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!options || !profile || atLimit}
              onClick={() => setIsChoosingStarter(true)}
              type="button"
            >
              New template
            </button>
            {!isLoading && !pageError && (
              <p className={`mt-2 text-xs ${atLimit ? "font-semibold text-amber-800" : "text-slate-500"}`}>
                {activeCount} of {MAX_ACTIVE_TEMPLATES} templates in use{atLimit ? ". Archive one to create another." : ""}
              </p>
            )}
          </div>
        </div>
        {pageError && <p className="mt-6 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{pageError}</p>}
        {isLoading && !pageError && <p className="mt-6 text-sm text-slate-600">Loading templates...</p>}
        {notice && <p className="mt-4 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm text-emerald-900" role="status">{notice}</p>}
      </section>

      {options && profile && !pageError && (
        <>
          <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-slate-950">Your templates</h2>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input checked={showArchived} className="h-4 w-4 accent-teal-700" onChange={(event) => setShowArchived(event.target.checked)} type="checkbox" />
                Show archived{archivedCount > 0 ? ` (${archivedCount})` : ""}
              </label>
            </div>
            {templates.length === 0 ? (
              <p className="mt-4 rounded-md bg-slate-50 p-5 text-sm text-slate-600 ring-1 ring-slate-200">You have not created any templates yet. Use &ldquo;New template&rdquo; or a starter below to make one.</p>
            ) : shown.length === 0 ? (
              <p className="mt-4 rounded-md bg-slate-50 p-5 text-sm text-slate-600 ring-1 ring-slate-200">All your templates are archived. Tick &ldquo;Show archived&rdquo; to see them.</p>
            ) : (
              <ul className="mt-5 space-y-4">
                {shown.map((template) => (
                  <TemplateCard
                    activeSignatoryIds={activeSignatoryIds}
                    atLimit={atLimit}
                    key={template.id}
                    onAction={(action) => { setNotice(""); setPendingAction({ action, template }); }}
                    onClone={() => { setNotice(""); setCloneSource(template); }}
                    options={options}
                    profile={profile}
                    signatories={signatories}
                    template={template}
                  />
                ))}
              </ul>
            )}
          </section>

          <StarterGallery controls={controls} onControlsChange={setControls} options={options} profile={profile} signatories={signatories} />
        </>
      )}

      {pendingAction && (
        <ConfirmActionDialog
          confirmLabel={ACTION_TEXT[pendingAction.action].confirmLabel}
          message={ACTION_TEXT[pendingAction.action].message(pendingAction.template.name)}
          onClose={() => setPendingAction(null)}
          onConfirm={() => runStatusAction(pendingAction.action, pendingAction.template)}
          title={ACTION_TEXT[pendingAction.action].title}
          tone={ACTION_TEXT[pendingAction.action].tone}
        />
      )}
      {cloneSource && (
        <CloneTemplateDialog
          onClose={() => setCloneSource(null)}
          onCloned={(clone) => {
            setNotice(`Cloned as "${clone.name}".`);
            void reloadTemplates();
          }}
          template={cloneSource}
        />
      )}
      {isChoosingStarter && options && profile && (
        <NewTemplateDialog onClose={() => setIsChoosingStarter(false)} options={options} profile={profile} signatories={signatories} />
      )}
    </div>
  );
}

function TemplateCard({ template, options, profile, signatories, activeSignatoryIds, atLimit, onAction, onClone }: {
  template: CertificateTemplateRecord;
  options: TemplateOptions;
  profile: InstitutionProfileDetails;
  signatories: Signatory[];
  activeSignatoryIds: string[];
  atLimit: boolean;
  onAction: (action: StatusAction) => void;
  onClone: () => void;
}) {
  const exporter = useCertificateExport();
  const snapshot = buildPreviewSnapshot(template.design, profile, signatories, { id: template.id, name: template.name });
  const data = sampleRenderData(options, "long");
  const hasInactiveSignatory = template.design.signatories.ids.some((id) => !activeSignatoryIds.includes(id));
  const button = "rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <li className={`flex flex-col gap-4 rounded-lg border p-4 sm:flex-row ${template.isArchived ? "border-slate-200 bg-slate-50" : "border-slate-200"}`}>
      <div className="w-full shrink-0 rounded-md bg-slate-100 p-2 sm:w-64">
        <ScaledCertificate data={data} snapshot={snapshot} />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="flex flex-wrap items-center gap-2 text-lg font-semibold text-slate-950">
          <span className="break-words">{template.name}</span>
          {template.isDefault && <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-semibold text-teal-800">Default</span>}
          {template.isArchived && <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-700">Archived</span>}
        </h3>
        <p className="mt-1 text-xs text-slate-500">Last updated {formatUpdated(template.updatedAt)}</p>
        {hasInactiveSignatory && <p className="mt-1 text-xs text-amber-800">Lists a signatory who is no longer active. Edit the template to remove them.</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <Link className="rounded-md bg-teal-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-800" href={`/institution/templates/${template.id}`}>
            {template.isArchived ? "Open" : "Edit"}
          </Link>
          <button className={button} disabled={atLimit} onClick={onClone} title={atLimit ? "Archive a template first" : undefined} type="button">Clone</button>
          {!template.isArchived && (template.isDefault
            ? <button className={button} onClick={() => onAction("clearDefault")} type="button">Remove default</button>
            : <button className={button} onClick={() => onAction("setDefault")} type="button">Set as default</button>)}
          {template.isArchived
            ? <button className={button} onClick={() => onAction("unarchive")} type="button">Unarchive</button>
            : <button className={button} onClick={() => onAction("archive")} type="button">Archive</button>}
          <button
            aria-busy={exporter.isExporting}
            className={button}
            disabled={exporter.isExporting}
            onClick={() => void exporter.runExport({ snapshot, data, fileName: certificatePdfFileName(`${template.name} sample`, data.certificateUid) })}
            type="button"
          >
            {exporter.isExporting ? "Preparing PDF..." : "Download sample PDF"}
          </button>
        </div>
        <div className="mt-2">
          <CertificateExportFeedback failure={exporter.failure} result={exporter.result} />
        </div>
      </div>
    </li>
  );
}

function StarterGallery({ options, profile, signatories, controls, onControlsChange }: {
  options: TemplateOptions;
  profile: InstitutionProfileDetails;
  signatories: Signatory[];
  controls: PreviewControls;
  onControlsChange: (controls: PreviewControls) => void;
}) {
  const data = sampleRenderData(options, controls.nameLength);
  const activeIds = signatories.map((signatory) => signatory.id);

  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
      <h2 className="text-xl font-semibold text-slate-950">Starter layouts</h2>
      <p className="mt-1 text-sm text-slate-600">Built-in designs to start from. Classic is used for certificates when you have no default template.</p>

      <fieldset className="mt-5 grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
        <legend className="px-1 text-sm font-semibold text-slate-700">Preview controls (not saved)</legend>
        <label className="block text-sm font-medium text-slate-700" htmlFor="preview-name-length">
          Sample name length
          <select className="field" id="preview-name-length" onChange={(event) => onControlsChange({ ...controls, nameLength: event.target.value as NameLength })} value={controls.nameLength}>
            <option value="short">Short</option>
            <option value="long">Long</option>
            <option value="veryLong">Very long</option>
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-700" htmlFor="preview-page-size">
          Page size
          <select className="field" id="preview-page-size" onChange={(event) => onControlsChange({ ...controls, pageSize: event.target.value as PreviewControls["pageSize"] })} value={controls.pageSize}>
            <option value="">As designed</option>
            <option value="A4">A4</option>
            <option value="LETTER">Letter</option>
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-700" htmlFor="preview-orientation">
          Orientation
          <select className="field" id="preview-orientation" onChange={(event) => onControlsChange({ ...controls, orientation: event.target.value as PreviewControls["orientation"] })} value={controls.orientation}>
            <option value="">As designed</option>
            <option value="landscape">Landscape</option>
            <option value="portrait">Portrait</option>
          </select>
        </label>
      </fieldset>

      <div className="mt-6 space-y-10">
        {options.starters.map((starter) => {
          const design = withPageOverrides(designFromStarter(starter.design, activeIds, options.limits.maxSignatories), controls);
          return (
            <StarterPreview
              data={data}
              description={starter.description}
              key={starter.id}
              name={starter.name}
              snapshot={buildPreviewSnapshot(design, profile, signatories, { id: null, name: starter.name })}
              starterId={starter.id}
            />
          );
        })}
      </div>
    </section>
  );
}

function StarterPreview({ name, description, starterId, snapshot, data }: { name: string; description: string; starterId: string; snapshot: RenderSnapshot; data: CertificateRenderData }) {
  const [layout, setLayout] = useState<CertificateLayout | null>(null);
  const exporter = useCertificateExport();

  return (
    <article>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-950">{name}</h3>
          <p className="mt-1 text-sm text-slate-600">{description}</p>
          <FitStatus layout={layout} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="rounded-md bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800" href={`/institution/templates/new?starter=${encodeURIComponent(starterId)}`}>Use this starter</Link>
          <button
            aria-busy={exporter.isExporting}
            className="rounded-md border border-teal-600 px-3 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-50 disabled:cursor-wait disabled:opacity-60"
            disabled={exporter.isExporting}
            onClick={() => void exporter.runExport({ snapshot, data, fileName: certificatePdfFileName(`${name} sample`, data.certificateUid) })}
            type="button"
          >
            {exporter.isExporting ? "Preparing PDF..." : "Download sample PDF"}
          </button>
        </div>
      </div>
      <div className="mt-2">
        <CertificateExportFeedback failure={exporter.failure} result={exporter.result} showSize />
      </div>
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
