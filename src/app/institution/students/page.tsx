import { InstitutionStudentsPanel } from "@/components/InstitutionStudentsPanel";

/** Only a page of this workspace can be a "return to" target, never another site. */
function safeReturnTo(value: unknown) {
  return typeof value === "string" && value.startsWith("/institution/") && !value.startsWith("//") ? value : undefined;
}

export default async function InstitutionStudentsPage({ searchParams }: { searchParams: Promise<{ edit?: string | string[]; returnTo?: string | string[] }> }) {
  const { edit, returnTo } = await searchParams;
  const editStudentId = typeof edit === "string" ? edit : undefined;
  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">Institution workspace</p>
      <h1 className="mt-2 text-3xl font-semibold text-slate-950">Students</h1>
      <InstitutionStudentsPanel editStudentId={editStudentId} key={editStudentId ?? ""} returnTo={safeReturnTo(returnTo)} />
    </section>
  );
}
