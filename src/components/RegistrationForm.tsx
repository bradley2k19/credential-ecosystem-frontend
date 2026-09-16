"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { registerEmployer, registerInstitution } from "@/lib/api";
import { AuthShell } from "@/components/AuthForm";

type RegistrationType = "institution" | "employer";
const fields = { institution: ["name", "registrationNumber", "address", "contactEmail"], employer: ["companyName", "registrationNumber", "industry", "contactEmail"] } as const;
const labels: Record<string, string> = { name: "Institution name", companyName: "Company name", registrationNumber: "Registration number", address: "Address", industry: "Industry", contactEmail: "Contact email" };

export function RegistrationForm({ type }: { type: RegistrationType }) {
  const [values, setValues] = useState<Record<string, string>>({ email: "", password: "" });
  const [error, setError] = useState(""); const [success, setSuccess] = useState(false); const [isSubmitting, setIsSubmitting] = useState(false);
  function updateValue(name: string, value: string) { setValues((current) => ({ ...current, [name]: value })); }
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (!values.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) { setError("Please enter a valid email address."); return; }
    if (!values.password || fields[type].some((field) => !values[field]?.trim())) { setError("Please complete all required fields."); return; }
    setIsSubmitting(true);
    try { if (type === "institution") await registerInstitution(values as never); else await registerEmployer(values as never); setSuccess(true); }
    catch (submissionError) { setError(submissionError instanceof Error ? submissionError.message : "Registration could not be completed."); }
    finally { setIsSubmitting(false); }
  }
  if (success) return <AuthShell title="Account created" subtitle="Your registration has been received."><div className="space-y-5"><p className="rounded-md bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800">Your account has been created and is awaiting verification.</p><Link className="button-primary block text-center" href="/login">Continue to sign in</Link></div></AuthShell>;
  return <AuthShell title={`Register ${type === "institution" ? "an institution" : "an employer"}`} subtitle="Create an account to join the credential ecosystem."><form className="space-y-4" onSubmit={handleSubmit}><InputField label="Email" name="email" type="email" value={values.email} onChange={updateValue} /><InputField label="Password" name="password" type="password" value={values.password} onChange={updateValue} />{fields[type].map((field) => <InputField key={field} label={labels[field]} name={field} type={field === "contactEmail" ? "email" : "text"} value={values[field] ?? ""} onChange={updateValue} />)}{error && <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}<button className="button-primary" disabled={isSubmitting} type="submit">{isSubmitting ? "Creating account..." : "Create account"}</button></form><p className="mt-6 text-center text-sm text-slate-600">Already registered? <Link className="font-semibold text-teal-700 hover:text-teal-900" href="/login">Sign in</Link></p></AuthShell>;
}

function InputField({ label, name, type, value, onChange }: { label: string; name: string; type: string; value: string; onChange: (name: string, value: string) => void }) {
  return <label className="block text-sm font-medium text-slate-700" htmlFor={name}>{label}<input className="field" id={name} name={name} onChange={(event) => onChange(name, event.target.value)} required type={type} value={value} /></label>;
}