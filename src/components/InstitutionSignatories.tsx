"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { AssetImage } from "@/components/AssetImage";
import { useInstitutionProfile } from "@/context/InstitutionProfileContext";
import {
  archiveSignatory,
  createSignatory,
  getSignatories,
  removeSignatorySignature,
  reorderSignatories,
  setSignatorySignature,
  updateSignatory,
  type Signatory,
} from "@/lib/api";
import { checkerboardClasses, formatBytes, prepareImageForUpload, type PreparedImage } from "@/lib/imageUpload";

const MAX_SIGNATORIES = 10;
const AUTHORISATION_TEXT = "I confirm that I am authorised to use this signature on certificates issued by this institution.";

function errorText(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function toUpload(image: PreparedImage) {
  return { data: image.data, mimeType: image.mimeType };
}

export function InstitutionSignatories() {
  const { refreshProfile } = useInstitutionProfile();
  const [signatories, setSignatories] = useState<Signatory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [listError, setListError] = useState("");
  const [isReordering, setIsReordering] = useState(false);

  useEffect(() => {
    let active = true;
    void getSignatories()
      .then((response) => { if (active) setSignatories(response.signatories); })
      .catch((requestError: unknown) => { if (active) setLoadError(errorText(requestError, "Signatories could not be loaded.")); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, []);

  function replaceSignatory(updated: Signatory) {
    setSignatories((current) => current.map((item) => (item.id === updated.id ? updated : item)));
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= signatories.length) return;
    const ids = signatories.map((item) => item.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setIsReordering(true);
    setListError("");
    try {
      setSignatories((await reorderSignatories(ids)).signatories);
    } catch (reorderError) {
      setListError(errorText(reorderError, "The order could not be saved."));
    } finally {
      setIsReordering(false);
    }
  }

  function handleArchived(signatoryId: string) {
    setSignatories((current) => current.filter((item) => item.id !== signatoryId));
    void refreshProfile();
  }

  function handleCreated(created: Signatory) {
    setSignatories((current) => [...current, created]);
    void refreshProfile();
  }

  const atLimit = signatories.length >= MAX_SIGNATORIES;

  return (
    <div>
      <h2 className="text-xl font-semibold text-slate-950">Signatories</h2>
      <p className="mt-1 text-sm text-slate-600">The people whose names and signatures appear on your certificates, in the order shown here.</p>

      {loadError && <p className="mt-5 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{loadError}</p>}
      {isLoading ? (
        <p className="mt-5 text-sm text-slate-600">Loading signatories...</p>
      ) : loadError ? null : (
        <>
          {listError && <p className="mt-5 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{listError}</p>}
          {signatories.length === 0 ? (
            <p className="mt-5 rounded-md bg-slate-50 p-5 text-sm text-slate-600 ring-1 ring-slate-200">No signatories yet. Add the first one below.</p>
          ) : (
            <ol className="mt-5 space-y-3">
              {signatories.map((signatory, index) => (
                <SignatoryRow
                  isFirst={index === 0}
                  isLast={index === signatories.length - 1}
                  isReordering={isReordering}
                  key={signatory.id}
                  onArchived={handleArchived}
                  onMove={(direction) => void move(index, direction)}
                  onUpdated={replaceSignatory}
                  position={index + 1}
                  signatory={signatory}
                />
              ))}
            </ol>
          )}

          <div className="mt-6 border-t border-slate-200 pt-6">
            <h3 className="text-base font-semibold text-slate-950">Add signatory</h3>
            {atLimit
              ? <p className="mt-3 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-950">You have reached the maximum of {MAX_SIGNATORIES} active signatories. Archive one to add another.</p>
              : <AddSignatoryForm onCreated={handleCreated} />}
          </div>
        </>
      )}
    </div>
  );
}

type RowMode = "view" | "edit" | "replace" | "archive";

function SignatoryRow({ signatory, position, isFirst, isLast, isReordering, onMove, onUpdated, onArchived }: {
  signatory: Signatory;
  position: number;
  isFirst: boolean;
  isLast: boolean;
  isReordering: boolean;
  onMove: (direction: -1 | 1) => void;
  onUpdated: (signatory: Signatory) => void;
  onArchived: (signatoryId: string) => void;
}) {
  const [mode, setMode] = useState<RowMode>("view");
  const [name, setName] = useState(signatory.name);
  const [title, setTitle] = useState(signatory.title);
  const [signature, setSignature] = useState<PreparedImage | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function changeMode(next: RowMode) {
    setMode(next);
    setError("");
    setMessage("");
    setName(signatory.name);
    setTitle(signatory.title);
    setSignature(null);
    setConfirmed(false);
  }

  async function run(action: () => Promise<void>, fallback: string) {
    setIsBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (actionError) {
      setError(errorText(actionError, fallback));
    } finally {
      setIsBusy(false);
    }
  }

  function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(async () => {
      onUpdated(await updateSignatory(signatory.id, { name: name.trim(), title: title.trim() }));
      setMode("view");
      setMessage("Signatory updated.");
    }, "The signatory could not be updated.");
  }

  function saveSignature(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!signature || !confirmed) return;
    void run(async () => {
      onUpdated(await setSignatorySignature(signatory.id, toUpload(signature), true));
      setMode("view");
      setSignature(null);
      setConfirmed(false);
      setMessage("Signature replaced.");
    }, "The signature could not be uploaded.");
  }

  const secondaryButton = "rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <li className="rounded-lg border border-slate-200 p-4">
      <div className="flex flex-wrap items-start gap-4">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-700" title={`Position ${position}`}>{position}</span>
        <div className={`flex h-20 w-48 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 ${checkerboardClasses}`}>
          {signatory.signatureUrl
            ? <AssetImage alt={`Signature of ${signatory.name}`} className="max-h-16 max-w-[90%] object-contain" path={signatory.signatureUrl} />
            : <span className="text-xs text-slate-500">No signature</span>}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-950">{signatory.name}</p>
          <p className="text-sm text-slate-600">{signatory.title}</p>
          {mode === "view" && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button className={secondaryButton} disabled={isBusy} onClick={() => changeMode("edit")} type="button">Edit</button>
              <button className={secondaryButton} disabled={isBusy} onClick={() => changeMode("replace")} type="button">{signatory.signatureUrl ? "Replace signature" : "Add signature"}</button>
              {signatory.signatureUrl && (
                <button
                  className={secondaryButton}
                  disabled={isBusy}
                  onClick={() => void run(async () => { onUpdated(await removeSignatorySignature(signatory.id)); setMessage("Signature removed."); }, "The signature could not be removed.")}
                  type="button"
                >
                  Remove signature
                </button>
              )}
              <button className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50" disabled={isBusy} onClick={() => changeMode("archive")} type="button">Archive</button>
              <button aria-label={`Move ${signatory.name} up`} className={secondaryButton} disabled={isFirst || isReordering || isBusy} onClick={() => onMove(-1)} type="button">Move up</button>
              <button aria-label={`Move ${signatory.name} down`} className={secondaryButton} disabled={isLast || isReordering || isBusy} onClick={() => onMove(1)} type="button">Move down</button>
            </div>
          )}
        </div>
      </div>

      {mode === "edit" && (
        <form className="mt-4 grid gap-3 sm:grid-cols-2" noValidate onSubmit={saveEdit}>
          <label className="block text-sm font-medium text-slate-700" htmlFor={`signatory-name-${signatory.id}`}>
            Name
            <input className="field" id={`signatory-name-${signatory.id}`} maxLength={100} onChange={(event) => setName(event.target.value)} required value={name} />
          </label>
          <label className="block text-sm font-medium text-slate-700" htmlFor={`signatory-title-${signatory.id}`}>
            Title
            <input className="field" id={`signatory-title-${signatory.id}`} maxLength={100} onChange={(event) => setTitle(event.target.value)} required value={title} />
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <button className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60" disabled={isBusy || !name.trim() || !title.trim()} type="submit">{isBusy ? "Saving..." : "Save"}</button>
            <button className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" disabled={isBusy} onClick={() => changeMode("view")} type="button">Cancel</button>
          </div>
        </form>
      )}

      {mode === "replace" && (
        <form className="mt-4 space-y-3" onSubmit={saveSignature}>
          <SignatureImagePicker idPrefix={`replace-${signatory.id}`} onChange={(image) => { setSignature(image); if (!image) setConfirmed(false); }} />
          {signature && <AuthorisationCheckbox checked={confirmed} id={`replace-confirm-${signatory.id}`} onChange={setConfirmed} />}
          <div className="flex gap-2">
            <button className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60" disabled={isBusy || !signature || !confirmed} type="submit">{isBusy ? "Uploading..." : "Save signature"}</button>
            <button className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" disabled={isBusy} onClick={() => changeMode("view")} type="button">Cancel</button>
          </div>
        </form>
      )}

      {mode === "archive" && (
        <div className="mt-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          <p className="font-semibold">Archive {signatory.name}?</p>
          <p className="mt-1">They will no longer be offered for new certificates. The record is kept, not deleted.</p>
          <div className="mt-3 flex gap-2">
            <button
              className="rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60"
              disabled={isBusy}
              onClick={() => void run(async () => { await archiveSignatory(signatory.id); onArchived(signatory.id); }, "The signatory could not be archived.")}
              type="button"
            >
              {isBusy ? "Archiving..." : "Archive signatory"}
            </button>
            <button className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" disabled={isBusy} onClick={() => changeMode("view")} type="button">Cancel</button>
          </div>
        </div>
      )}

      {message && <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">{message}</p>}
      {error && <p className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{error}</p>}
    </li>
  );
}

function AddSignatoryForm({ onCreated }: { onCreated: (signatory: Signatory) => void }) {
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [signature, setSignature] = useState<PreparedImage | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [pickerKey, setPickerKey] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || !title.trim() || (signature && !confirmed)) return;
    setIsSaving(true);
    setError("");
    setMessage("");
    try {
      const created = await createSignatory({
        name: name.trim(),
        title: title.trim(),
        ...(signature ? { signature: toUpload(signature), confirmAuthorised: true } : {}),
      });
      onCreated(created);
      setName("");
      setTitle("");
      setSignature(null);
      setConfirmed(false);
      setPickerKey((key) => key + 1);
      setMessage(`${created.name} added.`);
    } catch (createError) {
      setError(errorText(createError, "The signatory could not be added."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="mt-4 space-y-4" noValidate onSubmit={handleSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700" htmlFor="new-signatory-name">
          Name
          <input className="field" id="new-signatory-name" maxLength={100} onChange={(event) => setName(event.target.value)} required value={name} />
        </label>
        <label className="block text-sm font-medium text-slate-700" htmlFor="new-signatory-title">
          Title
          <input className="field" id="new-signatory-title" maxLength={100} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Registrar" required value={title} />
        </label>
      </div>
      <div>
        <p className="text-sm font-medium text-slate-700">Signature image (optional)</p>
        <SignatureImagePicker idPrefix="new-signatory" key={pickerKey} onChange={(image) => { setSignature(image); if (!image) setConfirmed(false); }} />
      </div>
      {signature && <AuthorisationCheckbox checked={confirmed} id="new-signatory-confirm" onChange={setConfirmed} />}
      {message && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">{message}</p>}
      {error && <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{error}</p>}
      <button
        className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isSaving || !name.trim() || !title.trim() || Boolean(signature && !confirmed)}
        type="submit"
      >
        {isSaving ? "Adding..." : "Add signatory"}
      </button>
    </form>
  );
}

function AuthorisationCheckbox({ id, checked, onChange }: { id: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950" htmlFor={id}>
      <input checked={checked} className="mt-0.5 size-4 shrink-0 accent-teal-700" id={id} onChange={(event) => onChange(event.target.checked)} required type="checkbox" />
      <span>{AUTHORISATION_TEXT} <span className="font-semibold">(required)</span></span>
    </label>
  );
}

/** Picks and prepares a signature image, with an optional white-background removal and before/after preview. */
function SignatureImagePicker({ idPrefix, onChange }: { idPrefix: string; onChange: (image: PreparedImage | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [original, setOriginal] = useState<PreparedImage | null>(null);
  const [cleaned, setCleaned] = useState<PreparedImage | null>(null);
  const [removeWhite, setRemoveWhite] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState("");

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    event.target.value = "";
    if (!chosen) return;
    setError("");
    setIsProcessing(true);
    try {
      const prepared = await prepareImageForUpload(chosen, "signature");
      const processed = removeWhite ? await prepareImageForUpload(chosen, "signature", { removeWhiteBackground: true }) : null;
      setFile(chosen);
      setOriginal(prepared);
      setCleaned(processed);
      onChange(processed ?? prepared);
    } catch (prepareError) {
      setFile(null);
      setOriginal(null);
      setCleaned(null);
      onChange(null);
      setError(errorText(prepareError, "The image could not be processed."));
    } finally {
      setIsProcessing(false);
    }
  }

  async function toggleRemoveWhite(checked: boolean) {
    setRemoveWhite(checked);
    if (!file || !original) return;
    if (!checked) {
      onChange(original);
      return;
    }
    if (cleaned) {
      onChange(cleaned);
      return;
    }
    setIsProcessing(true);
    try {
      const processed = await prepareImageForUpload(file, "signature", { removeWhiteBackground: true });
      setCleaned(processed);
      onChange(processed);
    } catch (prepareError) {
      setError(errorText(prepareError, "The background could not be removed."));
      setRemoveWhite(false);
    } finally {
      setIsProcessing(false);
    }
  }

  function clear() {
    setFile(null);
    setOriginal(null);
    setCleaned(null);
    setError("");
    onChange(null);
  }

  const selected = removeWhite && cleaned ? cleaned : original;

  return (
    <div className="mt-2 space-y-3">
      <input accept="image/png,image/jpeg" className="sr-only" id={`${idPrefix}-file`} onChange={handleFileChange} ref={inputRef} type="file" />
      <div className="flex flex-wrap items-center gap-2">
        <button className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60" disabled={isProcessing} onClick={() => inputRef.current?.click()} type="button">
          {isProcessing ? "Processing..." : original ? "Choose a different image" : "Choose signature image"}
        </button>
        {original && <button className="rounded-md px-3 py-2 text-sm font-semibold text-slate-600 hover:text-slate-950" onClick={clear} type="button">Remove image</button>}
        <label className="flex items-center gap-2 text-sm text-slate-700" htmlFor={`${idPrefix}-remove-white`}>
          <input checked={removeWhite} className="size-4 accent-teal-700" disabled={isProcessing} id={`${idPrefix}-remove-white`} onChange={(event) => void toggleRemoveWhite(event.target.checked)} type="checkbox" />
          Remove white background
        </label>
      </div>
      {original && (
        <div className={`grid gap-3 ${removeWhite && cleaned ? "sm:grid-cols-2" : ""}`}>
          {removeWhite && cleaned && <SignaturePreview image={original} label="Before" />}
          <SignaturePreview image={removeWhite && cleaned ? cleaned : original} label={removeWhite && cleaned ? "After" : "Preview"} />
        </div>
      )}
      {selected && <p className="text-xs text-slate-600">Ready to upload: {selected.width} × {selected.height} px, {formatBytes(selected.sizeBytes)} ({selected.mimeType === "image/png" ? "PNG" : "JPEG"})</p>}
      {error && <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{error}</p>}
      <p className="text-xs text-slate-500">PNG or JPEG, scaled down to fit 600 × 250 px. A PNG with a transparent background gives the best result.</p>
    </div>
  );
}

function SignaturePreview({ image, label }: { image: PreparedImage; label: string }) {
  return (
    <figure>
      <figcaption className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</figcaption>
      <div className={`flex h-28 items-center justify-center overflow-hidden rounded-md border border-slate-200 ${checkerboardClasses}`}>
        <AssetImage alt={`Signature ${label.toLowerCase()}`} className="max-h-24 max-w-[90%] object-contain" src={image.previewUrl} />
      </div>
    </figure>
  );
}
