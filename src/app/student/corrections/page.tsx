import { StudentCorrections } from "@/components/corrections/StudentCorrections";

export default async function StudentCorrectionsPage({ searchParams }: { searchParams: Promise<{ request?: string | string[] }> }) {
  const { request } = await searchParams;
  // ?request=<id> (from a notification) highlights that request.
  return <StudentCorrections highlightId={typeof request === "string" ? request : undefined} />;
}
