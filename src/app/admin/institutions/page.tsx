import { AdminInstitutions } from "@/components/AdminInstitutions";

export default async function AdminInstitutionsPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  // Lets the overview link straight to a filtered list, e.g. /admin/institutions?verified=false.
  const { verified } = await searchParams;
  const initialVerified = verified === "true" || verified === "false" ? verified : "";

  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
      {/* The key remounts the list when the URL filter changes, e.g. sidebar link vs. the overview's filtered link. */}
      <AdminInstitutions initialVerified={initialVerified} key={initialVerified} />
    </section>
  );
}
