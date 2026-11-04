"use client";

import Link from "next/link";
import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { AssetImage } from "@/components/AssetImage";
import { InstitutionSignatories } from "@/components/InstitutionSignatories";
import { useInstitutionProfile } from "@/context/InstitutionProfileContext";
import { removeInstitutionBrandImage, setInstitutionBrandImage, updateInstitutionProfile, type InstitutionProfileDetails } from "@/lib/api";
import { checkerboardClasses, formatBytes, prepareImageForUpload, type PreparedImage } from "@/lib/imageUpload";

const hexColorPattern = /^#[0-9A-Fa-f]{6}$/;
const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const DEFAULT_PICKER_COLOR = "#0F766E";

function errorText(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function InstitutionProfilePage() {
  const { profile, error } = useInstitutionProfile();

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">Institution workspace</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">Profile</h1>
        <p className="mt-2 text-slate-600">Your institution&apos;s details, branding and signatories. Uploaded once here and reused on your certificates.</p>
        {error && <p className="mt-6 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</p>}
        {!profile && !error && <p className="mt-6 text-sm text-slate-600">Loading profile...</p>}
        {profile && <Completeness profile={profile} />}
      </section>

      {profile && (
        <>
          <section className="scroll-mt-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8" id="details">
            <h2 className="text-xl font-semibold text-slate-950">Institution details</h2>
            <DetailsForm profile={profile} />
          </section>

          <section className="scroll-mt-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8" id="branding">
            <h2 className="text-xl font-semibold text-slate-950">Branding</h2>
            <p className="mt-1 text-sm text-slate-600">Use a PNG with a transparent background for the best result.</p>
            <div className="mt-5 grid gap-6 md:grid-cols-2">
              <BrandImagePanel currentPath={profile.logoUrl} kind="logo" />
              <BrandImagePanel currentPath={profile.sealUrl} kind="seal" />
            </div>
          </section>

          <section className="scroll-mt-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8" id="signatories">
            <InstitutionSignatories />
          </section>
        </>
      )}
    </div>
  );
}

/** A nudge, not a gate: every item can be completed in any order, and nothing is blocked while one is open. */
function Completeness({ profile }: { profile: InstitutionProfileDetails }) {
  const items = [
    { label: "Logo uploaded", done: Boolean(profile.logoUrl), href: "#branding", action: "Upload a logo" },
    { label: "At least one signatory", done: profile.signatoryCount > 0, href: "#signatories", action: "Add a signatory" },
    { label: "Contact details filled", done: Boolean(profile.address && profile.contactEmail), href: "#details", action: "Add address and contact email" },
    { label: "Wallet linked", done: Boolean(profile.walletAddress), href: "/institution/dashboard", action: "Link a wallet on the Overview page" },
    { label: "Institution verified", done: profile.isVerified, href: "/institution/dashboard", action: "Awaiting verification by the platform administrator" },
  ];
  const completed = items.filter((item) => item.done).length;

  return (
    <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-950">Profile completeness</h2>
        <p className="text-sm text-slate-600">{completed} of {items.length} complete</p>
      </div>
      <ul className="mt-4 space-y-2 text-sm">
        {items.map((item) => (
          <li className="flex items-start gap-3" key={item.label}>
            <span
              aria-hidden="true"
              className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${item.done ? "bg-emerald-600 text-white" : "border-2 border-slate-300 bg-white"}`}
            >
              {item.done ? "✓" : ""}
            </span>
            <span className={item.done ? "text-slate-700" : "text-slate-900"}>
              <span className="font-medium">{item.label}</span>
              <span className="sr-only">{item.done ? " (done)" : " (not done)"}</span>
              {!item.done && (
                <>
                  {" · "}
                  <Link className="font-semibold text-teal-700 underline hover:text-teal-900" href={item.href}>{item.action}</Link>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DetailsForm({ profile }: { profile: InstitutionProfileDetails }) {
  const { setProfile } = useInstitutionProfile();
  const [address, setAddress] = useState(profile.address ?? "");
  const [contactEmail, setContactEmail] = useState(profile.contactEmail ?? "");
  const [brandColor, setBrandColor] = useState(profile.brandColor ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const colorError = brandColor && !hexColorPattern.test(brandColor) ? "Enter a colour as # followed by six hex digits, for example #0F766E." : "";
  const emailError = contactEmail.trim() && !emailPattern.test(contactEmail.trim()) ? "Enter a valid email address." : "";
  const addressError = address.trim().length > 300 ? "The address must be at most 300 characters." : "";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    if (colorError || emailError || addressError) return;
    setIsSaving(true);
    try {
      const updated = await updateInstitutionProfile({
        address: address.trim() || null,
        contactEmail: contactEmail.trim() || null,
        brandColor: brandColor ? brandColor.toUpperCase() : null,
      });
      setProfile(updated);
      setBrandColor(updated.brandColor ?? "");
      setMessage("Profile saved.");
    } catch (saveError) {
      setError(errorText(saveError, "The profile could not be saved."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="mt-5 space-y-5" noValidate onSubmit={handleSubmit}>
      <dl className="grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-sm font-medium text-slate-700">Name</dt>
          <dd className="mt-1 text-slate-950">{profile.name}</dd>
        </div>
        <div>
          <dt className="text-sm font-medium text-slate-700">Registration number</dt>
          <dd className="mt-1 text-slate-950">{profile.registrationNumber}</dd>
        </div>
      </dl>
      <p className="text-xs text-slate-500">Name and registration number can only be changed by the platform administrator.</p>

      <label className="block text-sm font-medium text-slate-700" htmlFor="profile-address">
        Address
        <textarea
          aria-describedby={addressError ? "profile-address-error" : undefined}
          aria-invalid={addressError ? true : undefined}
          className="field min-h-20"
          id="profile-address"
          maxLength={300}
          onChange={(event) => setAddress(event.target.value)}
          value={address}
        />
      </label>
      {addressError && <p className="-mt-3 text-sm text-red-700" id="profile-address-error">{addressError}</p>}

      <label className="block text-sm font-medium text-slate-700" htmlFor="profile-email">
        Contact email
        <input
          aria-describedby={emailError ? "profile-email-error" : undefined}
          aria-invalid={emailError ? true : undefined}
          className="field"
          id="profile-email"
          onChange={(event) => setContactEmail(event.target.value)}
          type="email"
          value={contactEmail}
        />
      </label>
      {emailError && <p className="-mt-3 text-sm text-red-700" id="profile-email-error">{emailError}</p>}

      <fieldset>
        <legend className="text-sm font-medium text-slate-700">Brand colour</legend>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <input
            aria-label="Pick brand colour"
            className="h-10 w-14 cursor-pointer rounded-md border border-slate-300 bg-white p-1"
            onChange={(event) => setBrandColor(event.target.value.toUpperCase())}
            type="color"
            value={hexColorPattern.test(brandColor) ? brandColor.toLowerCase() : DEFAULT_PICKER_COLOR.toLowerCase()}
          />
          <input
            aria-describedby={colorError ? "profile-color-error" : "profile-color-hint"}
            aria-invalid={colorError ? true : undefined}
            aria-label="Brand colour hex value"
            className="field mt-0 w-36 font-mono uppercase"
            maxLength={7}
            onChange={(event) => setBrandColor(event.target.value.trim())}
            placeholder="#0F766E"
            value={brandColor}
          />
          <button className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50" disabled={!brandColor} onClick={() => setBrandColor("")} type="button">Clear</button>
        </div>
        {colorError
          ? <p className="mt-1 text-sm text-red-700" id="profile-color-error">{colorError}</p>
          : <p className="mt-1 text-xs text-slate-500" id="profile-color-hint">{brandColor ? "Used as the accent colour on your certificates." : "No brand colour set."}</p>}
      </fieldset>

      {message && <p className="rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">{message}</p>}
      {error && <p className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</p>}
      <button className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60" disabled={isSaving || Boolean(colorError || emailError || addressError)} type="submit">
        {isSaving ? "Saving..." : "Save details"}
      </button>
    </form>
  );
}

function BrandImagePanel({ kind, currentPath }: { kind: "logo" | "seal"; currentPath: string | null }) {
  const { setProfile } = useInstitutionProfile();
  const inputRef = useRef<HTMLInputElement>(null);
  const [prepared, setPrepared] = useState<PreparedImage | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const label = kind === "logo" ? "Logo" : "Seal";

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setMessage("");
    setError("");
    setIsBusy(true);
    try {
      setPrepared(await prepareImageForUpload(file, kind));
    } catch (prepareError) {
      setPrepared(null);
      setError(errorText(prepareError, "The image could not be processed."));
    } finally {
      setIsBusy(false);
    }
  }

  async function upload() {
    if (!prepared) return;
    setIsBusy(true);
    setError("");
    try {
      setProfile(await setInstitutionBrandImage(kind, { data: prepared.data, mimeType: prepared.mimeType }));
      setPrepared(null);
      setMessage(`${label} ${currentPath ? "replaced" : "uploaded"}.`);
    } catch (uploadError) {
      setError(errorText(uploadError, `The ${kind} could not be uploaded.`));
    } finally {
      setIsBusy(false);
    }
  }

  async function remove() {
    setIsBusy(true);
    setError("");
    setMessage("");
    try {
      setProfile(await removeInstitutionBrandImage(kind));
      setConfirmRemove(false);
      setMessage(`${label} removed.`);
    } catch (removeError) {
      setError(errorText(removeError, `The ${kind} could not be removed.`));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <h3 className="font-semibold text-slate-950">{label}</h3>
      <div className={`mt-3 flex h-40 items-center justify-center overflow-hidden rounded-md border border-slate-200 ${checkerboardClasses}`}>
        {prepared
          ? <AssetImage alt={`New ${kind} preview`} className="max-h-36 max-w-[90%] object-contain" src={prepared.previewUrl} />
          : currentPath
            ? <AssetImage alt={`Current ${kind}`} className="max-h-36 max-w-[90%] object-contain" path={currentPath} />
            : <span className="text-sm text-slate-500">No {kind} uploaded</span>}
      </div>
      {prepared && (
        <p className="mt-2 text-xs text-slate-600">Ready to upload: {prepared.width} × {prepared.height} px, {formatBytes(prepared.sizeBytes)} ({prepared.mimeType === "image/png" ? "PNG" : "JPEG"})</p>
      )}

      <input accept="image/png,image/jpeg" className="sr-only" id={`${kind}-file`} onChange={handleFileChange} ref={inputRef} type="file" />
      <div className="mt-3 flex flex-wrap gap-2">
        {prepared ? (
          <>
            <button className="rounded-md bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60" disabled={isBusy} onClick={() => void upload()} type="button">
              {isBusy ? "Uploading..." : `Save ${kind}`}
            </button>
            <button className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" disabled={isBusy} onClick={() => setPrepared(null)} type="button">Cancel</button>
          </>
        ) : confirmRemove ? (
          <>
            <button className="rounded-md bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60" disabled={isBusy} onClick={() => void remove()} type="button">
              {isBusy ? "Removing..." : `Yes, remove ${kind}`}
            </button>
            <button className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" disabled={isBusy} onClick={() => setConfirmRemove(false)} type="button">Cancel</button>
          </>
        ) : (
          <>
            <button className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60" disabled={isBusy} onClick={() => inputRef.current?.click()} type="button">
              {isBusy ? "Processing..." : currentPath ? "Replace" : "Upload"}
            </button>
            {currentPath && (
              <button className="rounded-md border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50" disabled={isBusy} onClick={() => { setMessage(""); setConfirmRemove(true); }} type="button">Remove</button>
            )}
          </>
        )}
      </div>
      {confirmRemove && <p className="mt-2 text-xs text-slate-600">This only unlinks the {kind} from your profile. The uploaded image itself is kept on record.</p>}
      {message && <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">{message}</p>}
      {error && <p className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{error}</p>}
      <p className="mt-3 text-xs text-slate-500">PNG or JPEG. Larger images are scaled down to {kind === "logo" ? "800" : "600"} px automatically.</p>
    </div>
  );
}
