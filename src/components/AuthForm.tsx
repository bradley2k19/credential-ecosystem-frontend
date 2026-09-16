"use client";

import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import { login as loginRequest } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export function LoginForm() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setIsSubmitting(true);
    try {
      const response = await loginRequest(email, password); login(response);
      const role = response.user?.role ?? response.role;
      const destinations = { institution: "/institution/dashboard", student: "/student/dashboard", employer: "/employer/dashboard" } as const;
      window.location.assign(destinations[role as keyof typeof destinations] ?? "/login");
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Invalid credentials");
    } finally { setIsSubmitting(false); }
  }

  return <AuthShell title="Welcome back" subtitle="Sign in to your credential ecosystem account.">
    <form className="space-y-5" onSubmit={handleSubmit}>
      <Field label="Email" name="email" type="email" value={email} onChange={setEmail} />
      <Field label="Password" name="password" type="password" value={password} onChange={setPassword} />
      {error && <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      <button className="button-primary" disabled={isSubmitting} type="submit">{isSubmitting ? "Signing in..." : "Sign in"}</button>
    </form>
    <p className="mt-6 text-center text-sm text-slate-600">Need an account? <Link className="font-semibold text-teal-700 hover:text-teal-900" href="/register/institution">Register an institution</Link> or <Link className="font-semibold text-teal-700 hover:text-teal-900" href="/register/employer">employer</Link>.</p>
  </AuthShell>;
}

function Field({ label, name, type, value, onChange }: { label: string; name: string; type: string; value: string; onChange: (value: string) => void }) {
  return <label className="block text-sm font-medium text-slate-700" htmlFor={name}>{label}<input className="field" id={name} name={name} onChange={(event) => onChange(event.target.value)} required type={type} value={value} /></label>;
}

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-12"><section className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200 sm:p-10"><div className="mb-8"><p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">Credential ecosystem</p><h1 className="text-3xl font-semibold tracking-tight text-slate-950">{title}</h1><p className="mt-2 text-slate-600">{subtitle}</p></div>{children}</section></main>;
}