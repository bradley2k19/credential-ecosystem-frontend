"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useState } from "react";
import { CertificateExportFeedback, useCertificateExport } from "@/components/certificate/CertificateExport";
import type { CertificateLayout } from "@/components/certificate/CertificateRenderer";
import { ScaledCertificate } from "@/components/certificate/ScaledCertificate";
import { SectionContent, SettingsSection } from "@/components/templates/EditorSections";
import { useUnsavedChangesGuard } from "@/components/templates/useUnsavedChangesGuard";
import { useInstitutionProfile } from "@/context/InstitutionProfileContext";
import {
  createInstitutionTemplate,
  getInstitutionStudents,
  getInstitutionTemplate,
  getSignatories,
  getTemplateOptions,
  setDefaultInstitutionTemplate,
  setInstitutionTemplateArchived,
  updateInstitutionTemplate,
  type CertificateTemplateRecord,
  type InstitutionProfileDetails,
  type Signatory,
  type StudentRecord,
  type TemplateOptions,
} from "@/lib/api";
import { buildPreviewSnapshot, pageSizeMm, type TemplateDesign } from "@/lib/certificateDesign";
import { certificatePdfFileName } from "@/lib/certificatePdf";
import {
  SECTIONS,
  TEMPLATE_NAME_MAX_LENGTH,
  describeIssue,
  designFromStarter,
  patchDesign,
  problemsFromServerMessage,
  renderableDesign,
  sampleRenderData,
  studentRenderData,
  validateDesign,
  validateTemplateName,
  type DesignIssue,
  type DesignSectionKey,
  type NameLength,
  type SectionId,
  type ServerProblems,
} from "@/lib/templateEditor";

const STUDENT_PREVIEW_LIMIT = 100;
const TEMPLATES_PATH = "/institution/templates";

interface SavedState {
  name: string;
  design: TemplateDesign;
  isDefault: boolean;
}

interface LoadedTemplate {
  options: TemplateOptions;
  signatories: Signatory[];
  template: CertificateTemplateRecord | null;
  initial: SavedState;
}

function errorText(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

/**
 * The template editor for a new template (from a starter) or an existing one. Loads the options, the active
 * signatories and the template, then hands them to the workspace. Nothing is saved until the user saves.
 */
export function TemplateEditor({ templateId, starterId }: { templateId?: string; starterId?: string }) {
  const { profile, error: profileError } = useInstitutionProfile();
  const [loaded, setLoaded] = useState<LoadedTemplate | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;
    void Promise.all([getTemplateOptions(), getSignatories(), templateId ? getInstitutionTemplate(templateId) : Promise.resolve(null)])
      .then(([options, signatoryResponse, template]) => {
        if (!active) return;
        const signatories = signatoryResponse.signatories;
        let initial: SavedState;
        if (template) {
          initial = { name: template.name, design: template.design, isDefault: template.isDefault };
        } else {
          const starter = options.starters.find((item) => item.id === starterId) ?? options.starters.find((item) => item.id === "classic") ?? options.starters[0];
          initial = {
            name: `${starter.name} template`,
            design: designFromStarter(starter.design, signatories.map((signatory) => signatory.id), options.limits.maxSignatories),
            isDefault: false,
          };
        }
        setLoaded({ options, signatories, template, initial });
      })
      .catch((requestError: unknown) => { if (active) setLoadError(errorText(requestError, "The template could not be loaded.")); });
    return () => { active = false; };
  }, [templateId, starterId]);

  const error = loadError || profileError;
  if (error) {
    return (
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <p className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</p>
        <Link className="mt-4 inline-block text-sm font-semibold text-teal-700 hover:text-teal-900" href={TEMPLATES_PATH}>&larr; Back to templates</Link>
      </div>
    );
  }
  if (!loaded || !profile) return <p className="text-sm text-slate-600">Loading the template editor...</p>;
  return <EditorWorkspace loaded={loaded} profile={profile} templateId={templateId} />;
}

function EditorWorkspace({ loaded, profile, templateId }: { loaded: LoadedTemplate; profile: InstitutionProfileDetails; templateId?: string }) {
  const router = useRouter();
  const { options, signatories } = loaded;
  const isNew = !templateId;

  // One typed design state; every change goes through patchDesign.
  const [saved, setSaved] = useState<SavedState>(loaded.initial);
  const [name, setName] = useState(loaded.initial.name);
  const [design, setDesign] = useState<TemplateDesign>(loaded.initial.design);
  const [useAsDefault, setUseAsDefault] = useState(loaded.initial.isDefault);
  const [isArchived, setIsArchived] = useState(loaded.template?.isArchived ?? false);
  const [openSections, setOpenSections] = useState<SectionId[]>(["page"]);
  const [attemptedSave, setAttemptedSave] = useState(false);
  const [serverProblems, setServerProblems] = useState<ServerProblems | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [saveNotice, setSaveNotice] = useState("");
  const [archiveError, setArchiveError] = useState("");

  const [previewChoice, setPreviewChoice] = useState<NameLength | "student">("long");
  const [students, setStudents] = useState<StudentRecord[] | null>(null);
  const [studentTotal, setStudentTotal] = useState(0);
  const [studentsError, setStudentsError] = useState("");
  const [studentId, setStudentId] = useState("");
  const [layout, setLayout] = useState<CertificateLayout | null>(null);
  const exporter = useCertificateExport();

  const readOnly = isArchived;
  const isDirty = name !== saved.name || useAsDefault !== saved.isDefault || JSON.stringify(design) !== JSON.stringify(saved.design);
  useUnsavedChangesGuard(isDirty);

  // Validation: instant client checks, plus whatever the server reported for the last save.
  const clientIssues = validateDesign(design, options, signatories.map((signatory) => signatory.id));
  const issues: DesignIssue[] = [
    ...clientIssues,
    ...(serverProblems?.issues ?? []).filter((issue) => !clientIssues.some((client) => client.path === issue.path && client.message === issue.message)),
  ];
  const nameProblem = validateTemplateName(name);
  const nameError = nameProblem || serverProblems?.nameError || "";
  const messagesFor = (path: string) => Array.from(new Set(issues.filter((issue) => issue.path === path).map((issue) => issue.message)));
  const summaryLines = [
    ...(attemptedSave || serverProblems?.nameError ? (nameError ? [{ text: nameError, section: null }] : []) : []),
    ...(attemptedSave ? issues : serverProblems?.issues ?? []).map((issue) => ({ text: describeIssue(issue), section: issue.section })),
    ...(serverProblems?.general ?? []).map((text) => ({ text, section: null })),
  ];

  function openSectionsOf(list: DesignIssue[]) {
    const ids = list.map((issue) => issue.section).filter((section): section is SectionId => section !== null);
    setOpenSections((current) => Array.from(new Set([...current, ...ids])));
  }

  function update<S extends DesignSectionKey>(section: S, patch: Partial<TemplateDesign[S]>) {
    setDesign((current) => patchDesign(current, section, patch));
    setJustSaved(false);
    // A server message about this part of the design no longer applies once it changes.
    setServerProblems((current) => current && { ...current, issues: current.issues.filter((issue) => !issue.path.startsWith(`design.${section}`) && issue.path !== "design") });
  }

  function toggleSection(id: SectionId) {
    setOpenSections((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function showSection(id: SectionId) {
    setOpenSections((current) => (current.includes(id) ? current : [...current, id]));
    requestAnimationFrame(() => document.getElementById(`section-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function handleSave() {
    if (readOnly || isSaving) return;
    setAttemptedSave(true);
    setJustSaved(false);
    setSaveNotice("");
    if (nameProblem || clientIssues.length > 0) {
      openSectionsOf(clientIssues);
      return;
    }
    setIsSaving(true);
    setServerProblems(null);
    try {
      const payload = { name: name.trim(), design };
      const record = templateId ? await updateInstitutionTemplate(templateId, payload) : await createInstitutionTemplate(payload);
      let isDefault = record.isDefault;
      if (useAsDefault !== record.isDefault) {
        try {
          await setDefaultInstitutionTemplate(useAsDefault ? record.id : null);
          isDefault = useAsDefault;
        } catch (defaultError) {
          setSaveNotice(`The template was saved, but the default template could not be changed: ${errorText(defaultError, "please try again")}`);
        }
      }
      const next = { name: record.name, design: record.design, isDefault };
      setSaved(next);
      setName(next.name);
      setDesign(next.design);
      setUseAsDefault(isDefault);
      setAttemptedSave(false);
      if (!templateId) {
        router.replace(`${TEMPLATES_PATH}/${record.id}`);
        return;
      }
      setJustSaved(true);
    } catch (saveError) {
      const problems = problemsFromServerMessage(errorText(saveError, "The template could not be saved. Please try again."));
      setServerProblems(problems);
      openSectionsOf(problems.issues);
    } finally {
      setIsSaving(false);
    }
  }

  function handleReset() {
    if (!window.confirm("Discard your unsaved changes and go back to the last saved version?")) return;
    setName(saved.name);
    setDesign(saved.design);
    setUseAsDefault(saved.isDefault);
    setServerProblems(null);
    setAttemptedSave(false);
  }

  async function handleUnarchive() {
    if (!templateId) return;
    setArchiveError("");
    try {
      const record = await setInstitutionTemplateArchived(templateId, false);
      setIsArchived(record.isArchived);
    } catch (unarchiveError) {
      setArchiveError(errorText(unarchiveError, "The template could not be unarchived."));
    }
  }

  function choosePreview(choice: NameLength | "student") {
    setPreviewChoice(choice);
    if (choice !== "student" || students !== null) return;
    setStudentsError("");
    void getInstitutionStudents(1, STUDENT_PREVIEW_LIMIT)
      .then((response) => {
        setStudents(response.students);
        setStudentTotal(response.pagination.total);
        setStudentId(response.students[0]?.id ?? "");
      })
      .catch((requestError: unknown) => setStudentsError(errorText(requestError, "Your students could not be loaded.")));
  }

  // The preview follows a deferred copy of the design, so typing stays responsive while it redraws.
  const deferredRawDesign = useDeferredValue(design);
  const deferredDesign = renderableDesign(deferredRawDesign, saved.design);
  const templateRef = { id: templateId ?? null, name: name.trim() || "Untitled template" };
  const previewSnapshot = buildPreviewSnapshot(deferredDesign, profile, signatories, templateRef);
  const student = students?.find((item) => item.id === studentId);
  const previewData = previewChoice === "student" && student ? studentRenderData(options, student) : sampleRenderData(options, previewChoice === "student" ? "long" : previewChoice);
  const page = pageSizeMm(deferredDesign.page);

  function handleDownload() {
    void exporter.runExport({
      snapshot: buildPreviewSnapshot(renderableDesign(design, saved.design), profile, signatories, templateRef),
      data: previewData,
      fileName: certificatePdfFileName(`${templateRef.name} sample`, previewData.certificateUid),
    });
  }

  const sectionProps = { design, update, messagesFor, options, profile, signatories };

  return (
    <>
      <div className="rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200 lg:hidden">
        <p className="font-semibold text-slate-900">Please use a larger screen to edit templates.</p>
        <Link className="mt-3 inline-block text-sm font-semibold text-teal-700 hover:text-teal-900" href={TEMPLATES_PATH}>&larr; Back to templates</Link>
      </div>

      <div className="hidden h-[calc(100dvh-2rem)] min-h-[560px] flex-col gap-3 lg:flex">
        <header className="rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link className="text-sm font-semibold text-teal-700 hover:text-teal-900" href={TEMPLATES_PATH}>&larr; Templates</Link>
            <div className="min-w-48 flex-1">
              <label className="sr-only" htmlFor="template-name">Template name</label>
              <input
                aria-describedby={nameError ? "template-name-error" : undefined}
                aria-invalid={Boolean(nameError)}
                className={`w-full rounded-md border px-3 py-1.5 text-base font-semibold text-slate-950 outline-none focus:ring-2 focus:ring-teal-100 disabled:bg-slate-50 ${nameError ? "border-red-400" : "border-slate-300 focus:border-teal-600"}`}
                disabled={readOnly}
                id="template-name"
                maxLength={TEMPLATE_NAME_MAX_LENGTH}
                onChange={(event) => {
                  setName(event.target.value);
                  setJustSaved(false);
                  setServerProblems((current) => current && { ...current, nameError: "" });
                }}
                placeholder="Template name"
                value={name}
              />
              {nameError && <p className="mt-0.5 text-xs text-red-700" id="template-name-error">{nameError}</p>}
            </div>
            <span aria-live="polite" className={`text-xs font-semibold ${isDirty || isNew ? "text-amber-700" : "text-emerald-700"}`}>
              {isNew ? "Not saved yet" : isDirty ? "● Unsaved changes" : justSaved ? "Saved" : "All changes saved"}
            </span>
            <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50" disabled={!isDirty || readOnly || isSaving} onClick={handleReset} type="button">
              Reset changes
            </button>
            <button aria-busy={exporter.isExporting} className="rounded-md border border-teal-600 px-3 py-1.5 text-sm font-semibold text-teal-800 hover:bg-teal-50 disabled:cursor-wait disabled:opacity-60" disabled={exporter.isExporting} onClick={handleDownload} type="button">
              {exporter.isExporting ? "Preparing PDF..." : "Download sample PDF"}
            </button>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input checked={useAsDefault} className="h-4 w-4 accent-teal-700" disabled={readOnly} onChange={(event) => { setUseAsDefault(event.target.checked); setJustSaved(false); }} type="checkbox" />
              Use as my default template
            </label>
            <button
              className="rounded-md bg-teal-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={readOnly || isSaving || (!isNew && !isDirty)}
              onClick={() => void handleSave()}
              type="button"
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
          </div>
          <CertificateExportFeedback failure={exporter.failure} result={exporter.result} />
          {saveNotice && <p className="mt-1 text-sm text-amber-800" role="status">{saveNotice}</p>}
          {!isNew && !readOnly && <p className="mt-1 text-xs text-slate-500">Changes affect only certificates you issue from now on. Certificates already issued keep their own design.</p>}
        </header>

        {readOnly && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <p>This template is archived, so it opens read-only and cannot be used for new certificates. Unarchive it to edit or use it again.</p>
            <button className="rounded-md bg-amber-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-800" onClick={() => void handleUnarchive()} type="button">Unarchive</button>
            {archiveError && <p className="basis-full text-red-800" role="alert">{archiveError}</p>}
          </div>
        )}

        <div className="grid min-h-0 flex-1 grid-cols-[380px_minmax(0,1fr)] gap-4">
          <aside aria-label="Template settings" className="min-h-0 overflow-y-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
            {summaryLines.length > 0 && (
              <div className="m-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900" role="alert">
                <p className="font-semibold">{serverProblems ? "The template could not be saved:" : "Fix these problems before saving:"}</p>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {summaryLines.map((line, index) => (
                    <li key={`${index}-${line.text}`}>
                      {line.section
                        ? <button className="text-left underline decoration-red-300 hover:decoration-red-700" onClick={() => showSection(line.section!)} type="button">{line.text}</button>
                        : line.text}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <fieldset className="min-w-0" disabled={readOnly}>
              {SECTIONS.map((section) => (
                <SettingsSection
                  hasErrors={issues.some((issue) => issue.section === section.id)}
                  id={section.id}
                  isOpen={openSections.includes(section.id)}
                  key={section.id}
                  onToggle={() => toggleSection(section.id)}
                  title={section.title}
                >
                  <SectionContent id={section.id} {...sectionProps} />
                </SettingsSection>
              ))}
            </fieldset>
          </aside>

          <section aria-label="Preview" className="min-h-0 overflow-y-auto rounded-xl bg-slate-200/70 p-4">
            <div className="sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-3 rounded-lg bg-white/95 px-3 py-2 shadow-sm ring-1 ring-slate-200 backdrop-blur">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                Preview with
                <select className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm" onChange={(event) => choosePreview(event.target.value as NameLength | "student")} value={previewChoice}>
                  <option value="short">Sample data, short name</option>
                  <option value="long">Sample data, long name</option>
                  <option value="veryLong">Sample data, very long name</option>
                  <option value="student">One of my students</option>
                </select>
              </label>
              {previewChoice === "student" && (
                studentsError ? <span className="text-sm text-red-700">{studentsError}</span>
                  : students === null ? <span className="text-sm text-slate-600">Loading students...</span>
                    : students.length === 0 ? <span className="text-sm text-slate-600">You have no students yet, so sample data is shown.</span>
                      : (
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                          Student
                          <select className="max-w-64 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm" onChange={(event) => setStudentId(event.target.value)} value={studentId}>
                            {students.map((item) => <option key={item.id} value={item.id}>{item.fullName} ({item.studentNumber})</option>)}
                          </select>
                          {studentTotal > students.length && <span className="text-xs font-normal text-slate-500">Your {students.length} most recent students</span>}
                        </label>
                      )
              )}
              <span className="text-xs text-slate-500">Preview only, nothing here is saved.</span>
            </div>
            <FitStatus layout={layout} />
            <div className="mx-auto" style={{ maxWidth: `calc((100dvh - 15rem) * ${page.width / page.height})` }}>
              <ScaledCertificate data={previewData} onLayout={setLayout} snapshot={previewSnapshot} />
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

/** The renderer's auto-fit result: nothing at 100%, the reduced size, or a warning when it still overflows. */
function FitStatus({ layout }: { layout: CertificateLayout | null }) {
  if (!layout) return null;
  if (layout.overflow) {
    return (
      <p className="mb-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800" role="alert">
        This content does not fit the page. Shorten the text, remove a signatory or reduce sizes.
      </p>
    );
  }
  if (layout.fontScale < 1) return <p className="mb-3 text-sm text-amber-800" role="status">Text reduced to {Math.round(layout.fontScale * 100)}% to fit the page</p>;
  return null;
}
