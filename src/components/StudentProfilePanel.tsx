"use client";

import { useEffect, useState, type FormEvent } from "react";
import { changePassword, getStudentProfile, type StudentProfile } from "@/lib/api";

const MIN_PASSWORD_LENGTH = 8;

export function StudentProfilePanel() {
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    void getStudentProfile()
      .then((response) => { if (active) setProfile(response); })
      .catch((requestError: unknown) => {
        if (active) setLoadError(requestError instanceof Error ? requestError.message : "Your profile could not be loaded.");
      })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, []);

  async function handleChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError("");
    setPasswordMessage("");

    // Passwords are read straight from the form and never kept in component state.
    const form = event.currentTarget;
    const formData = new FormData(form);
    const currentPassword = String(formData.get("currentPassword") ?? "");
    const newPassword = String(formData.get("newPassword") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");

    if (!currentPassword) {
      setPasswordError("Enter your current password.");
      return;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setPasswordError(`Your new password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("The new password and its confirmation do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword);
      form.reset();
      setPasswordMessage("Your password has been changed. Use it the next time you sign in.");
    } catch (requestError) {
      setPasswordError(requestError instanceof Error ? requestError.message : "Your password could not be changed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      <section>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">Account</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">Profile</h1>
        <p className="mt-2 text-slate-600">These details are managed by your institution. Contact them if anything is wrong.</p>

        {loadError && <p className="mt-6 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{loadError}</p>}
        {isLoading ? (
          <p className="mt-6 text-sm text-slate-600">Loading your profile...</p>
        ) : profile && (
          <dl className="mt-6 grid gap-x-6 gap-y-4 rounded-md border border-slate-200 p-5 sm:grid-cols-2">
            <Detail label="Name" value={profile.fullName} />
            <Detail label="Student number" value={profile.studentNumber} />
            <Detail label="Programme" value={profile.programName} />
            <Detail label="Enrolment year" value={String(profile.enrollmentYear)} />
            <Detail label="Email" value={profile.email} />
            <Detail label="Institution" value={profile.institutionName} />
          </dl>
        )}
      </section>

      <section className="rounded-md border border-slate-200 p-5 sm:p-6">
        <h2 className="text-xl font-semibold text-slate-950">Change password</h2>
        <p className="mt-2 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">If you were given a temporary password by your institution, change it now.</p>

        <form className="mt-5 max-w-md space-y-4" noValidate onSubmit={handleChangePassword}>
          <PasswordField autoComplete="current-password" label="Current password" name="currentPassword" />
          <PasswordField autoComplete="new-password" hint={`At least ${MIN_PASSWORD_LENGTH} characters.`} label="New password" name="newPassword" />
          <PasswordField autoComplete="new-password" label="Confirm new password" name="confirmPassword" />
          {passwordError && <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{passwordError}</p>}
          {passwordMessage && <p className="rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">{passwordMessage}</p>}
          <button className="button-primary sm:w-auto" disabled={isSubmitting} type="submit">{isSubmitting ? "Changing password..." : "Change password"}</button>
        </form>
      </section>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 break-words font-medium text-slate-900">{value}</dd>
    </div>
  );
}

function PasswordField({ label, name, autoComplete, hint }: { label: string; name: string; autoComplete: string; hint?: string }) {
  return (
    <label className="block text-sm font-medium text-slate-700" htmlFor={`profile-${name}`}>
      {label}
      <input autoComplete={autoComplete} className="field" id={`profile-${name}`} name={name} required type="password" />
      {hint && <span className="mt-1 block text-xs font-normal text-slate-500">{hint}</span>}
    </label>
  );
}
