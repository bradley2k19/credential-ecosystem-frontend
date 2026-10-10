import { StudentCertificateDetail } from "@/components/StudentCertificateDetail";

export default async function StudentCertificatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
      <StudentCertificateDetail certificateId={id} />
    </section>
  );
}
