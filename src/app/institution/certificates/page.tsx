import { InstitutionCertificates } from "@/components/InstitutionCertificates";

export default function InstitutionCertificatesPage() {
  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">Institution workspace</p>
      <h1 className="mt-2 text-3xl font-semibold text-slate-950">Certificates</h1>
      <div className="mt-6"><InstitutionCertificates /></div>
    </section>
  );
}