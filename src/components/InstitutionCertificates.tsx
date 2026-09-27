"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import {
  createInstitutionCertificate,
  getInstitutionCertificateBlockchainStatus,
  getInstitutionCertificates,
  getInstitutionIssuerStatus,
  getInstitutionStudents,
  recordInstitutionCertificateTransaction,
  type CertificateRecord,
  type IssuerStatus,
  type StudentRecord,
} from "@/lib/api";
import { getCertificateRegistryContract } from "@/lib/contract";
import { getWalletSigner } from "@/lib/wallet";

const POLL_INTERVAL_MS = 3500;
const MAX_STATUS_CHECKS = 20;
const EXPLORER_TX_URL = "https://amoy.polygonscan.com/tx/";

type IssuanceState = "idle" | "creating" | "wallet" | "recording" | "confirming" | "confirmed" | "failed" | "cancelled" | "timed-out";

interface CertificateForm {
  studentId: string;
  certificateType: string;
  programName: string;
  classification: string;
  issueDate: string;
  graduationDate: string;
}

function errorCode(error: unknown) {
  if (typeof error === "object" && error !== null && "code" in error) return error.code;
  return undefined;
}

function errorMessage(error: unknown) {
  if (typeof error === "object" && error !== null && "shortMessage" in error && typeof error.shortMessage === "string") {
    return error.shortMessage;
  }
  return error instanceof Error ? error.message : "An unexpected error occurred.";
}

function isWalletRejection(error: unknown) {
  const code = errorCode(error);
  const message = errorMessage(error).toLowerCase();
  return code === 4001 || code === "ACTION_REJECTED" || message.includes("user rejected") || message.includes("user denied");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

function emptyCertificateForm(): CertificateForm {
  return { studentId: "", certificateType: "", programName: "", classification: "", issueDate: "", graduationDate: "" };
}

export function InstitutionCertificates() {
  const [issuerStatus, setIssuerStatus] = useState<IssuerStatus | null>(null);
  const [isCheckingApproval, setIsCheckingApproval] = useState(true);
  const [approvalError, setApprovalError] = useState("");
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [certificates, setCertificates] = useState<CertificateRecord[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [listError, setListError] = useState("");
  const [form, setForm] = useState<CertificateForm>(emptyCertificateForm);
  const [issuanceState, setIssuanceState] = useState<IssuanceState>("idle");
  const [issuanceMessage, setIssuanceMessage] = useState("");
  const [issuanceError, setIssuanceError] = useState("");
  const [createdCertificate, setCreatedCertificate] = useState<CertificateRecord | null>(null);
  const [transactionHash, setTransactionHash] = useState("");

  async function refreshCertificates() {
    setListError("");
    try {
      const response = await getInstitutionCertificates();
      setCertificates(response.certificates);
    } catch (error) {
      setListError(errorMessage(error));
    }
  }

  useEffect(() => {
    let isCurrent = true;

    async function loadApprovalAndData() {
      try {
        const status = await getInstitutionIssuerStatus();
        if (!isCurrent) return;
        setIssuerStatus(status);
        if (!status.hasWallet || !status.isIssuer) return;

        setIsLoadingData(true);
        const [studentResponse, certificateResponse] = await Promise.all([
          getInstitutionStudents(),
          getInstitutionCertificates(),
        ]);
        if (!isCurrent) return;
        setStudents(studentResponse.students);
        setCertificates(certificateResponse.certificates);
      } catch (error) {
        if (isCurrent) setApprovalError(errorMessage(error));
      } finally {
        if (isCurrent) {
          setIsCheckingApproval(false);
          setIsLoadingData(false);
        }
      }
    }

    void loadApprovalAndData();
    return () => { isCurrent = false; };
  }, []);

  function updateForm<K extends keyof CertificateForm>(field: K, value: CertificateForm[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIssuanceState("creating");
    setIssuanceMessage("Saving certificate details...");
    setIssuanceError("");
    setCreatedCertificate(null);
    setTransactionHash("");

    let savedCertificate: CertificateRecord | null = null;

    try {
      savedCertificate = await createInstitutionCertificate({
        studentId: form.studentId,
        certificateType: form.certificateType.trim(),
        programName: form.programName.trim(),
        classification: form.classification.trim() || undefined,
        issueDate: form.issueDate,
        graduationDate: form.graduationDate || undefined,
      });
      setCreatedCertificate(savedCertificate);
      setCertificates((current) => [savedCertificate!, ...current.filter((item) => item.id !== savedCertificate!.id)]);
      setForm(emptyCertificateForm());

      setIssuanceState("wallet");
      setIssuanceMessage("Waiting for wallet confirmation...");
      const signer = await getWalletSigner();
      const contract = getCertificateRegistryContract(signer);
      const transaction = await contract.issueCertificate(savedCertificate.certificateUid, savedCertificate.certificateHash);
      setTransactionHash(transaction.hash);

      setIssuanceState("recording");
      setIssuanceMessage("Transaction submitted. Recording it with the institution account...");
      await recordInstitutionCertificateTransaction(savedCertificate.id, transaction.hash);

      setIssuanceState("confirming");
      setIssuanceMessage("Transaction recorded. Waiting for blockchain confirmation...");
      for (let attempt = 0; attempt < MAX_STATUS_CHECKS; attempt += 1) {
        if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        const statusResponse = await getInstitutionCertificateBlockchainStatus(savedCertificate.id);
        const transactionStatus = statusResponse.transactions.find(
          (item) => item.txHash.toLowerCase() === transaction.hash.toLowerCase() && item.txType === "ISSUE",
        )?.status;

        if (transactionStatus === "CONFIRMED") {
          setIssuanceState("confirmed");
          setIssuanceMessage("Certificate issued and confirmed on Polygon Amoy.");
          await refreshCertificates();
          return;
        }
        if (transactionStatus === "FAILED") {
          setIssuanceState("failed");
          setIssuanceMessage("");
          setIssuanceError("The blockchain transaction failed. The certificate still exists in the database; the on-chain step can potentially be retried.");
          await refreshCertificates();
          return;
        }
      }

      setIssuanceState("timed-out");
      setIssuanceError("The transaction is still pending after several checks. The certificate is saved in the database; check again later.");
      await refreshCertificates();
    } catch (error) {
      setIssuanceMessage("");
      if (savedCertificate) {
        setCreatedCertificate(savedCertificate);
        await refreshCertificates();
      }

      if (isWalletRejection(error)) {
        setIssuanceState("cancelled");
        setIssuanceError(savedCertificate
          ? "Transaction cancelled. The certificate was still created in the database, but the on-chain step was not completed. Its details remain available in this page session for a later retry."
          : "Wallet request cancelled before a certificate was created.");
      } else {
        setIssuanceState("failed");
        const message = errorMessage(error);
        setIssuanceError(savedCertificate
          ? transactionHash
            ? `The transaction was submitted, but blockchain tracking failed: ${message}. The certificate remains saved in the database.`
            : `The certificate was created in the database, but the blockchain step failed: ${message}`
          : message);
      }
    }
  }

  const isProcessing = ["creating", "wallet", "recording", "confirming"].includes(issuanceState);

  if (isCheckingApproval) {
    return <p className="rounded-md bg-slate-50 p-5 text-sm text-slate-600">Checking issuer approval...</p>;
  }

  if (approvalError) {
    return <div className="space-y-4 rounded-md bg-red-50 p-5 text-sm text-red-800"><p>{approvalError}</p><Link className="font-semibold underline" href="/institution/dashboard">Return to Overview</Link></div>;
  }

  if (!issuerStatus?.hasWallet || !issuerStatus.isIssuer) {
    return (
      <div className="space-y-4 rounded-md bg-amber-50 p-5 text-sm text-amber-900">
        <p>You must connect a wallet and be approved before issuing certificates.</p>
        <Link className="font-semibold underline" href="/institution/dashboard">Go to Overview</Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="rounded-md border border-slate-200 p-5 sm:p-6">
        <h2 className="text-xl font-semibold text-slate-950">Issue a certificate</h2>
        <p className="mt-2 text-sm text-slate-600">The certificate is saved first, then submitted to Polygon Amoy from your connected wallet.</p>

        {isLoadingData ? <p className="mt-5 text-sm text-slate-600">Loading students and certificates...</p> : students.length === 0 ? (
          <p className="mt-5 rounded-md bg-slate-50 p-4 text-sm text-slate-600">Add a student before issuing a certificate. <Link className="font-semibold text-teal-700 underline" href="/institution/students">Go to Students</Link></p>
        ) : (
          <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
            <label className="block text-sm font-medium text-slate-700 sm:col-span-2" htmlFor="certificate-student">
              Student
              <select className="field" id="certificate-student" onChange={(event) => {
                const student = students.find((item) => item.id === event.target.value);
                updateForm("studentId", event.target.value);
                if (student) updateForm("programName", student.programName);
              }} required value={form.studentId}>
                <option value="">Select a student</option>
                {students.map((student) => <option key={student.id} value={student.id}>{student.fullName} ({student.studentNumber})</option>)}
              </select>
            </label>
            <FormField label="Certificate type" name="certificateType" value={form.certificateType} onChange={updateForm} />
            <FormField label="Program name" name="programName" value={form.programName} onChange={updateForm} />
            <FormField label="Classification (optional)" name="classification" value={form.classification} onChange={updateForm} required={false} />
            <FormField label="Issue date" name="issueDate" type="date" value={form.issueDate} onChange={updateForm} />
            <FormField label="Graduation date (optional)" name="graduationDate" type="date" value={form.graduationDate} onChange={updateForm} required={false} />
            <button className="button-primary sm:col-span-2" disabled={isProcessing} type="submit">
              {isProcessing ? "Issuing certificate..." : "Create and issue certificate"}
            </button>
          </form>
        )}

        {issuanceMessage && <p className={`mt-5 rounded-md px-4 py-3 text-sm ${issuanceState === "confirmed" ? "bg-emerald-50 text-emerald-800" : "bg-sky-50 text-sky-900"}`} role="status">{issuanceMessage}</p>}
        {issuanceError && <p className="mt-5 rounded-md bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950" role="alert">{issuanceError}{createdCertificate && <span className="mt-1 block">Saved certificate ID: <span className="font-mono">{createdCertificate.certificateUid}</span></span>}</p>}
        {transactionHash && <p className="mt-3 break-all text-sm text-slate-600">Transaction: <a className="font-semibold text-teal-700 underline" href={`${EXPLORER_TX_URL}${transactionHash}`} rel="noreferrer" target="_blank">{transactionHash}</a></p>}
        {issuanceState === "confirmed" && transactionHash && <p className="mt-2 text-sm"><a className="font-semibold text-teal-700 underline" href={`${EXPLORER_TX_URL}${transactionHash}`} rel="noreferrer" target="_blank">View transaction on PolygonScan</a></p>}
      </section>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">Issued certificates</h2>
            <p className="mt-1 text-sm text-slate-600">Database status is shown here; blockchain status is checked during issuance.</p>
          </div>
          <button className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => void refreshCertificates()} type="button">Refresh list</button>
        </div>
        {listError && <p className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{listError}</p>}
        {certificates.length === 0 ? (
          <p className="mt-4 rounded-md bg-slate-50 p-4 text-sm text-slate-600">No certificates have been issued yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-md border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-600"><tr><th className="px-4 py-3 font-semibold">Student</th><th className="px-4 py-3 font-semibold">Type</th><th className="px-4 py-3 font-semibold">Program</th><th className="px-4 py-3 font-semibold">Issue date</th><th className="px-4 py-3 font-semibold">Status</th></tr></thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {certificates.map((certificate) => (
                  <tr key={certificate.id}>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">{certificate.student.fullName}<span className="block text-xs font-normal text-slate-500">{certificate.student.studentNumber}</span></td>
                    <td className="px-4 py-3 text-slate-700">{certificate.certificateType}</td>
                    <td className="px-4 py-3 text-slate-700">{certificate.programName}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">{formatDate(certificate.issueDate)}</td>
                    <td className="whitespace-nowrap px-4 py-3"><span className={certificate.status === "ACTIVE" ? "font-semibold text-emerald-700" : "font-semibold text-slate-600"}>{certificate.status === "ACTIVE" ? "Active" : "Revoked"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function FormField<K extends keyof CertificateForm>({
  label,
  name,
  type = "text",
  value,
  onChange,
  required = true,
}: {
  label: string;
  name: K;
  type?: string;
  value: CertificateForm[K];
  onChange: <Field extends keyof CertificateForm>(field: Field, value: CertificateForm[Field]) => void;
  required?: boolean;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700" htmlFor={`certificate-${name}`}>
      {label}
      <input
        className="field"
        id={`certificate-${name}`}
        name={name}
        onChange={(event) => onChange(name, event.target.value)}
        required={required}
        type={type}
        value={value}
      />
    </label>
  );
}