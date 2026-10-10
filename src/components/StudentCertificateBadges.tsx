import type { StudentCertificate } from "@/lib/api";

export function isConfirmedOnChain(certificate: Pick<StudentCertificate, "onChain">) {
  return certificate.onChain?.issue?.status === "CONFIRMED";
}

export function CertificateStatusBadge({ status }: { status: string }) {
  const isActive = status === "ACTIVE";
  return (
    <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${isActive ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>
      {isActive ? "Active" : "Revoked"}
    </span>
  );
}

export function OnChainBadge({ certificate }: { certificate: Pick<StudentCertificate, "onChain"> }) {
  const status = certificate.onChain?.issue?.status;
  const [label, classes] = status === "CONFIRMED"
    ? ["Confirmed on blockchain", "bg-emerald-100 text-emerald-800"]
    : status === "PENDING"
      ? ["Pending confirmation", "bg-sky-100 text-sky-900"]
      : ["Not yet recorded", "bg-slate-100 text-slate-700"];
  return <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${classes}`}>{label}</span>;
}
