"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CertificateStatusBadge, OnChainBadge } from "@/components/StudentCertificateBadges";
import { getStudentCertificates, type StudentCertificate } from "@/lib/api";
import { formatCertificateDate } from "@/lib/verification";

export function StudentCertificates() {
  const [certificates, setCertificates] = useState<StudentCertificate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void getStudentCertificates()
      .then((response) => { if (active) setCertificates(response.certificates); })
      .catch((requestError: unknown) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "Your certificates could not be loaded.");
      })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, []);

  return (
    <section>
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">Credentials</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">My certificates</h1>
        <p className="mt-2 text-slate-600">Select a certificate to view it, share its verification link or download it.</p>
      </div>

      {error && <p className="mt-6 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</p>}
      {isLoading ? (
        <p className="mt-6 text-sm text-slate-600">Loading your certificates...</p>
      ) : error ? null : certificates.length === 0 ? (
        <p className="mt-6 rounded-md bg-slate-50 p-5 text-sm text-slate-600 ring-1 ring-slate-200">No certificates have been issued to you yet.</p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-md border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-600">
              <tr>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 font-semibold">Programme</th>
                <th className="px-4 py-3 font-semibold">Institution</th>
                <th className="px-4 py-3 font-semibold">Issue date</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Blockchain</th>
                <th className="px-4 py-3 font-semibold"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {certificates.map((certificate) => (
                <tr key={certificate.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <Link className="hover:text-teal-800 hover:underline" href={`/student/certificates/${certificate.id}`}>{certificate.certificateType}</Link>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{certificate.programName}</td>
                  <td className="px-4 py-3 text-slate-700">{certificate.institutionName}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">{formatCertificateDate(certificate.issueDate)}</td>
                  <td className="px-4 py-3"><CertificateStatusBadge status={certificate.status} /></td>
                  <td className="px-4 py-3"><OnChainBadge certificate={certificate} /></td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <Link className="rounded-md border border-teal-600 px-3 py-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-50" href={`/student/certificates/${certificate.id}`}>View</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
