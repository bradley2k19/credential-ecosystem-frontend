"use client";

import Link from "next/link";
import { useDeferredValue, useMemo } from "react";
import { ScaledCertificate } from "@/components/certificate/ScaledCertificate";
import type { CertificateTemplateRecord, InstitutionProfileDetails, Signatory, StudentRecord, TemplateOptions } from "@/lib/api";
import { buildPreviewSnapshot, type CertificateRenderData } from "@/lib/certificateDesign";
import { designFromStarter, sampleRenderData } from "@/lib/templateEditor";

/** The name the backend gives the built-in design; it is used when no template is sent and none is the default. */
export const BUILT_IN_TEMPLATE_NAME = "Classic (built-in)";
const TEMPLATES_PATH = "/institution/templates";

export interface IssuanceTemplates {
  templates: CertificateTemplateRecord[];
  options: TemplateOptions;
  signatories: Signatory[];
}

/**
 * The template a certificate will be issued with: the user's choice while it is still an active template,
 * otherwise the default template, otherwise the built-in Classic (""). "" is only possible without a default,
 * because sending no templateId makes the backend use the default template when there is one.
 */
export function effectiveTemplateId(templates: CertificateTemplateRecord[], chosen: string | null) {
  const defaultId = templates.find((template) => template.isDefault)?.id ?? "";
  if (chosen === null) return defaultId;
  if (chosen === "") return defaultId ? defaultId : "";
  return templates.some((template) => template.id === chosen) ? chosen : defaultId;
}

/** The "Certificate template" dropdown of the issuance form. */
export function TemplatePicker({ templates, value, onChange, disabled, loadError }: {
  templates: CertificateTemplateRecord[] | null;
  value: string;
  onChange: (templateId: string) => void;
  disabled: boolean;
  loadError: string;
}) {
  const hasDefault = templates?.some((template) => template.isDefault) ?? false;
  const none = templates !== null && templates.length === 0;
  return (
    <div className="sm:col-span-2">
      <label className="block text-sm font-medium text-slate-700" htmlFor="certificate-template">
        Certificate template
        <select
          className="field"
          disabled={disabled || templates === null || none}
          id="certificate-template"
          onChange={(event) => onChange(event.target.value)}
          value={templates === null ? "" : value}
        >
          {templates === null ? (
            <option value="">{loadError ? "Your default template" : "Loading templates..."}</option>
          ) : (
            <>
              {!hasDefault && <option value="">{BUILT_IN_TEMPLATE_NAME}</option>}
              {templates.map((template) => (
                <option key={template.id} value={template.id}>{template.name}{template.isDefault ? " (default)" : ""}</option>
              ))}
            </>
          )}
        </select>
      </label>
      {none && (
        <p className="mt-1 text-xs text-slate-600">
          Certificates use the built-in Classic design. <Link className="font-semibold text-teal-700 underline hover:text-teal-900" href={TEMPLATES_PATH}>Create your own templates</Link>
        </p>
      )}
      {loadError && <p className="mt-1 text-xs text-amber-800">Your templates could not be loaded ({loadError}). The certificate will use your default template, or Classic if you have none.</p>}
    </div>
  );
}

/** Backend messages about the chosen template or its signatories, which block issuance before anything is saved. */
export function isTemplateProblem(message: string) {
  return /template/i.test(message) || /^Signatory\b/.test(message);
}

export function templateProblemText(message: string) {
  if (/templateId must be one of your institution's templates/i.test(message)) return "The chosen template no longer exists or has been archived.";
  return message;
}

/** Shown when issuing was refused because of the template; the form keeps everything the user entered. */
export function TemplateProblem({ message, templateId }: { message: string; templateId: string }) {
  return (
    <div className="mt-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm leading-6 text-red-900" role="alert">
      <p className="font-semibold">The certificate was not issued because of a problem with its template.</p>
      <p>{templateProblemText(message)}</p>
      <p className="mt-1">
        Everything you entered is kept.{" "}
        <a className="font-semibold underline" href={templateId ? `${TEMPLATES_PATH}/${templateId}` : TEMPLATES_PATH} rel="noreferrer" target="_blank">
          {templateId ? "Edit the template" : "Open your templates"} (opens in a new tab)
        </a>
        , or choose another template, then issue again.
      </p>
    </div>
  );
}

export interface IssuanceFormValues {
  studentId: string;
  certificateType: string;
  programName: string;
  classification: string;
  issueDate: string;
  graduationDate: string;
}

/**
 * A live preview of the certificate about to be issued, drawn by the one renderer from the chosen template and
 * the form's current values. Fields not filled in yet show sample values, and the preview says which.
 */
export function IssuancePreview({ choices, templateId, profile, form, student }: {
  choices: IssuanceTemplates;
  templateId: string;
  profile: InstitutionProfileDetails;
  form: IssuanceFormValues;
  student: StudentRecord | undefined;
}) {
  const { options, signatories, templates } = choices;
  const template = templates.find((item) => item.id === templateId) ?? null;
  const activeIds = useMemo(() => signatories.map((signatory) => signatory.id), [signatories]);

  const snapshot = useMemo(() => {
    const classic = options.starters.find((starter) => starter.id === "classic") ?? options.starters[0];
    const design = template ? template.design : designFromStarter(classic.design, activeIds, options.limits.maxSignatories);
    return buildPreviewSnapshot(design, profile, signatories, template ? { id: template.id, name: template.name } : { id: null, name: BUILT_IN_TEMPLATE_NAME });
  }, [template, options, activeIds, profile, signatories]);

  const { data, sampleFields } = useMemo(() => {
    const samples = sampleRenderData(options, "long");
    const used: string[] = [];
    const value = (entered: string, sample: string, label: string) => {
      if (entered.trim()) return entered.trim();
      used.push(label);
      return sample;
    };
    const values: CertificateRenderData = {
      certificateUid: samples.certificateUid,
      studentName: student ? student.fullName : value("", samples.studentName, "student"),
      studentNumber: student ? student.studentNumber : samples.studentNumber,
      certificateType: value(form.certificateType, samples.certificateType, "certificate type"),
      programName: value(form.programName, samples.programName, "programme"),
      classification: value(form.classification, samples.classification ?? "", "classification"),
      issueDate: value(form.issueDate, samples.issueDate ?? "", "issue date"),
      graduationDate: value(form.graduationDate, samples.graduationDate ?? "", "graduation date"),
      institutionName: profile.name,
    };
    return { data: values, sampleFields: used };
  }, [form.certificateType, form.classification, form.graduationDate, form.issueDate, form.programName, options, profile.name, student]);

  // Typing stays responsive: the preview redraws from a deferred copy.
  const deferredSnapshot = useDeferredValue(snapshot);
  const deferredData = useDeferredValue(data);
  const inactiveSignatory = template?.design.signatories.ids.some((id) => !activeIds.includes(id)) ?? false;
  const optionalSamples = sampleFields.filter((field) => field === "classification" || field === "graduation date");

  return (
    <details className="mt-6 rounded-md border border-slate-200 bg-slate-50" open>
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-900">Preview</summary>
      <div className="space-y-3 px-4 pb-4">
        <p className="text-sm text-slate-600">The final certificate is created from your profile and this template at the moment you issue it.</p>
        {sampleFields.length > 0 && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900" data-testid="preview-sample-note">
            Showing sample data for: {sampleFields.join(", ")}.
            {optionalSamples.length > 0 && ` If you leave ${optionalSamples.join(" or ")} empty, it is left off the certificate.`}
          </p>
        )}
        {inactiveSignatory && template && (
          <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900" role="alert">
            This template lists a signatory who is no longer active, so issuing with it will be refused.{" "}
            <a className="font-semibold underline" href={`${TEMPLATES_PATH}/${template.id}`} rel="noreferrer" target="_blank">Edit the template (opens in a new tab)</a>
          </p>
        )}
        <p className="text-xs text-slate-500">The certificate ID and QR code shown here are examples until the certificate is issued.</p>
        <div className="mx-auto max-w-3xl" data-testid="issuance-preview">
          <ScaledCertificate data={deferredData} snapshot={deferredSnapshot} />
        </div>
      </div>
    </details>
  );
}
