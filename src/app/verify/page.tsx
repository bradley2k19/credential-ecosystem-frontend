import { PublicVerifyForm } from "@/components/PublicVerifyForm";

export default function PublicVerifyPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold text-slate-950">Verify a certificate</h1>
        <p className="mt-2 text-slate-600">Enter the certificate ID printed on the certificate to check that it is genuine. No account is needed.</p>
      </div>
      <PublicVerifyForm />
    </div>
  );
}
