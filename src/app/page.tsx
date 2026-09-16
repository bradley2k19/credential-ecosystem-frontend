import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-12">
      <section className="w-full max-w-2xl rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200 sm:p-12">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">Credential ecosystem</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950">Manage trusted credentials.</h1>
        <p className="mt-4 max-w-xl text-lg leading-8 text-slate-600">Register an institution or employer, or sign in to continue to your role-based workspace.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link className="button-primary w-auto" href="/login">Sign in</Link>
          <Link className="rounded-md border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50" href="/register/institution">Register institution</Link>
          <Link className="rounded-md border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50" href="/register/employer">Register employer</Link>
        </div>
      </section>
    </main>
  );
}
