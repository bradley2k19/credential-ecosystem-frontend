import { InstitutionStudentsPanel } from "@/components/InstitutionStudentsPanel";

export default function InstitutionStudentsPage() {
  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">Institution workspace</p>
      <h1 className="mt-2 text-3xl font-semibold text-slate-950">Students</h1>
      <InstitutionStudentsPanel />
    </section>
  );
}