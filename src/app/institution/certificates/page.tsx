import { InstitutionCertificates } from "@/components/InstitutionCertificates";

export default async function InstitutionCertificatesPage({ searchParams }: { searchParams: Promise<{ correct?: string | string[]; preview?: string | string[] }> }) {
  const { correct, preview } = await searchParams;
  // ?correct=<requestId> reissues an approved correction request; ?preview=<certificateId> opens one certificate.
  const correctRequestId = typeof correct === "string" ? correct : undefined;
  const initialPreviewId = typeof preview === "string" ? preview : undefined;
  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">Institution workspace</p>
      <h1 className="mt-2 text-3xl font-semibold text-slate-950">Certificates</h1>
      <div className="mt-6">
        <InstitutionCertificates correctRequestId={correctRequestId} initialPreviewId={initialPreviewId} key={`${correctRequestId ?? ""}|${initialPreviewId ?? ""}`} />
      </div>
    </section>
  );
}
