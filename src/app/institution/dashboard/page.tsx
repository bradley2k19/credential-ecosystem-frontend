import { InstitutionWalletPanel } from "@/components/InstitutionWalletPanel";

export default function InstitutionOverviewPage() {
  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">Overview</p>
      <h1 className="mt-2 text-3xl font-semibold text-slate-950">Institution overview</h1>
      <InstitutionWalletPanel />
    </section>
  );
}