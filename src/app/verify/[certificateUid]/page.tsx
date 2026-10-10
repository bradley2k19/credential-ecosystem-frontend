import { PublicVerification } from "@/components/PublicVerification";

export default async function PublicVerifyResultPage({
  params,
  searchParams,
}: {
  params: Promise<{ certificateUid: string }>;
  searchParams: Promise<{ m?: string | string[] }>;
}) {
  const { certificateUid } = await params;
  const { m } = await searchParams;
  // QR codes link here with ?m=qr so the check is recorded as a scan rather than a typed ID.
  return <PublicVerification certificateUid={decodeURIComponent(certificateUid)} method={m === "qr" ? "qr" : "manual_id"} />;
}
