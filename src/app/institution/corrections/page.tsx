import { InstitutionCorrections } from "@/components/corrections/InstitutionCorrections";

export default async function InstitutionCorrectionsPage({ searchParams }: { searchParams: Promise<{ request?: string | string[] }> }) {
  const { request } = await searchParams;
  // ?request=<id> (from a notification) opens that request.
  const requestId = typeof request === "string" ? request : undefined;
  return <InstitutionCorrections initialRequestId={requestId} key={requestId ?? ""} />;
}
