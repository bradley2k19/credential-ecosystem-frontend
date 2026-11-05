"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ScaledCertificate } from "@/components/certificate/ScaledCertificate";
import { cloneInstitutionTemplate, type CertificateTemplateRecord, type InstitutionProfileDetails, type Signatory, type TemplateOptions } from "@/lib/api";
import { buildPreviewSnapshot } from "@/lib/certificateDesign";
import { TEMPLATE_NAME_MAX_LENGTH, designFromStarter, sampleRenderData, validateTemplateName } from "@/lib/templateEditor";

function errorText(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

/** A native modal dialog, opened on mount. Escape closes it unless an action is running. */
function Modal({ title, isBusy = false, onClose, children, wide = false }: { title: string; isBusy?: boolean; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      aria-labelledby={titleId}
      className={`m-auto w-[calc(100%-2rem)] rounded-2xl bg-white p-6 text-slate-900 shadow-xl backdrop:bg-slate-950/40 ${wide ? "max-w-5xl" : "max-w-md"}`}
      onCancel={(event) => { if (isBusy) event.preventDefault(); else onClose(); }}
      ref={dialogRef}
    >
      <h2 className="text-lg font-semibold text-slate-950" id={titleId}>{title}</h2>
      {children}
    </dialog>
  );
}

/**
 * A short confirmation for a status-changing action. If the server refuses (for example archiving the default
 * template, or the template limit), its message is shown here and the dialog stays open.
 */
export function ConfirmActionDialog({ title, message, confirmLabel, tone = "normal", onConfirm, onClose }: {
  title: string;
  message: string;
  confirmLabel: string;
  tone?: "normal" | "danger";
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleConfirm() {
    setIsBusy(true);
    setError("");
    try {
      await onConfirm();
      onClose();
    } catch (actionError) {
      setError(errorText(actionError, "That did not work. Please try again."));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <Modal isBusy={isBusy} onClose={onClose} title={title}>
      <p className="mt-2 text-sm leading-6 text-slate-600">{message}</p>
      {error && <p className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" disabled={isBusy} onClick={onClose} type="button">Cancel</button>
        <button
          className={`rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${tone === "danger" ? "bg-red-700 hover:bg-red-800" : "bg-teal-700 hover:bg-teal-800"}`}
          disabled={isBusy}
          onClick={() => void handleConfirm()}
          type="button"
        >
          {isBusy ? "Working..." : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

/** Asks for the clone's name, defaulting to "Copy of …", and shows the server's message for a duplicate or the limit. */
export function CloneTemplateDialog({ template, onCloned, onClose }: { template: CertificateTemplateRecord; onCloned: (clone: CertificateTemplateRecord) => void; onClose: () => void }) {
  const inputId = useId();
  const [name, setName] = useState(`Copy of ${template.name}`.slice(0, TEMPLATE_NAME_MAX_LENGTH));
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");
  const nameProblem = validateTemplateName(name);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (nameProblem) return;
    setIsBusy(true);
    setError("");
    try {
      onCloned(await cloneInstitutionTemplate(template.id, name.trim()));
      onClose();
    } catch (cloneError) {
      setError(errorText(cloneError, "The template could not be cloned."));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <Modal isBusy={isBusy} onClose={onClose} title={`Clone "${template.name}"`}>
      <form className="mt-3" onSubmit={(event) => void handleSubmit(event)}>
        <label className="block text-sm font-medium text-slate-700" htmlFor={inputId}>Name of the copy</label>
        <input autoFocus className="field" id={inputId} maxLength={TEMPLATE_NAME_MAX_LENGTH} onChange={(event) => { setName(event.target.value); setError(""); }} value={name} />
        {(nameProblem || error) && <p className="mt-1 text-sm text-red-700" role="alert">{nameProblem || error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" disabled={isBusy} onClick={onClose} type="button">Cancel</button>
          <button className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60" disabled={isBusy || Boolean(nameProblem)} type="submit">
            {isBusy ? "Cloning..." : "Clone"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Offers the starters with small previews; choosing one opens the editor with that design, unsaved. */
export function NewTemplateDialog({ options, profile, signatories, onClose }: {
  options: TemplateOptions;
  profile: InstitutionProfileDetails;
  signatories: Signatory[];
  onClose: () => void;
}) {
  const data = sampleRenderData(options, "long");
  const activeIds = signatories.map((signatory) => signatory.id);
  const classic = options.starters.find((starter) => starter.id === "classic") ?? options.starters[0];
  return (
    <Modal onClose={onClose} title="New template" wide>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">Start from one of the starter layouts. Nothing is saved until you save in the editor.</p>
        {classic && (
          <Link className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800" href={`/institution/templates/new?starter=${encodeURIComponent(classic.id)}`}>
            Start from {classic.name}
          </Link>
        )}
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        {options.starters.map((starter) => (
          <div className="flex flex-col rounded-lg border border-slate-200 p-3" key={starter.id}>
            <div className="rounded-md bg-slate-100 p-2">
              <ScaledCertificate
                data={data}
                snapshot={buildPreviewSnapshot(designFromStarter(starter.design, activeIds, options.limits.maxSignatories), profile, signatories, { id: null, name: starter.name })}
              />
            </div>
            <h3 className="mt-3 font-semibold text-slate-950">{starter.name}</h3>
            <p className="mt-1 flex-1 text-xs text-slate-600">{starter.description}</p>
            <Link className="mt-3 rounded-md border border-teal-600 px-3 py-2 text-center text-sm font-semibold text-teal-800 hover:bg-teal-50" href={`/institution/templates/new?starter=${encodeURIComponent(starter.id)}`}>
              Use this starter
            </Link>
          </div>
        ))}
      </div>
      <div className="mt-5 flex justify-end">
        <button className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={onClose} type="button">Cancel</button>
      </div>
    </Modal>
  );
}
