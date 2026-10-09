"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  createInstitutionCertificate,
  getInstitutionCertificateBlockchainStatus,
  getInstitutionCertificates,
  getInstitutionIssuerStatus,
  getInstitutionStudents,
  revokeInstitutionCertificate,
  type BlockchainTxType,
  type CertificateRecord,
  type IssuerStatus,
  type OnChainTransactionSummary,
  type StudentRecord,
} from "@/lib/api";
import {
  describeOnChainFailure,
  errorMessage,
  EXPLORER_TX_URL,
  getLinkedWalletSigner,
  isWalletRejection,
  onChainPhaseMessages,
  submitOnChainStep,
  type OnChainOutcome,
  type OnChainPhase,
} from "@/lib/onChain";

type IssuanceState = "idle" | "creating" | OnChainPhase | "confirmed" | "failed" | "cancelled" | "timed-out";
type RowActionPhase = "form" | "revoking" | OnChainPhase | "confirmed" | "failed" | "cancelled" | "timed-out" | "stopped";
type ChainState = "confirmed" | "pending" | "failed" | "missing";

interface CertificateForm {
  studentId: string;
  certificateType: string;
  programName: string;
  classification: string;
  issueDate: string;
  graduationDate: string;
}

interface RowAction {
  certificateId: string;
  kind: "revoke" | "retry";
  phase: RowActionPhase;
  reason: string;
  reasonError: string;
  message: string;
  error: string;
  transactionHash: string;
}

const busyPhases: string[] = ["creating", "revoking", "wallet-check", "wallet", "recording", "confirming"];

const ISSUE_INCOMPLETE_NOTE = "The certificate is saved in the database, but its on-chain record is incomplete. Use “Retry on-chain step” in the list to finish it.";
const REVOKE_INCOMPLETE_NOTE = "The certificate is already revoked in the database, so verifiers will see it as revoked. Only the on-chain record is incomplete. Use “Retry on-chain step” in the list to finish it.";

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
}

function emptyCertificateForm(): CertificateForm {
  return { studentId: "", certificateType: "", programName: "", classification: "", issueDate: "", graduationDate: "" };
}

function chainState(transaction: OnChainTransactionSummary | null | undefined): ChainState {
  if (!transaction) return "missing";
  if (transaction.status === "CONFIRMED") return "confirmed";
  if (transaction.status === "FAILED") return "failed";
  return "pending";
}

/** The on-chain step that matters for a certificate: issuance until it's confirmed, then revocation once revoked. */
function currentChainStep(certificate: CertificateRecord): { txType: BlockchainTxType; state: ChainState; txHash?: string } {
  const issue = certificate.onChain?.issue;
  if (chainState(issue) !== "confirmed" || certificate.status !== "REVOKED") {
    return { txType: "ISSUE", state: chainState(issue), txHash: issue?.txHash };
  }
  const revoke = certificate.onChain?.revoke;
  return { txType: "REVOKE", state: chainState(revoke), txHash: revoke?.txHash };
}

function outcomeText(outcome: OnChainOutcome, txType: BlockchainTxType) {
  const incompleteNote = txType === "ISSUE" ? ISSUE_INCOMPLETE_NOTE : REVOKE_INCOMPLETE_NOTE;
  if (outcome === "confirmed") {
    return { message: txType === "ISSUE" ? "Certificate issued and confirmed on Polygon Amoy." : "Revocation confirmed on Polygon Amoy.", error: "" };
  }
  if (outcome === "failed") return { message: "", error: `The blockchain transaction failed. ${incompleteNote}` };
  return { message: "", error: `The transaction is still pending after several checks. Use “Check status” in the list later. ${txType === "REVOKE" ? "The certificate is already revoked in the database." : "The certificate is saved in the database."}` };
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
  const [rowAction, setRowAction] = useState<RowAction | null>(null);
  const [checkingStatusId, setCheckingStatusId] = useState("");

  const linkedWallet = issuerStatus?.walletAddress;
  const isBusy = busyPhases.includes(issuanceState) || (rowAction !== null && busyPhases.includes(rowAction.phase));

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

  function updateRowAction(changes: Partial<RowAction>) {
    setRowAction((current) => (current ? { ...current, ...changes } : current));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIssuanceState("wallet-check");
    setIssuanceMessage(onChainPhaseMessages["wallet-check"]);
    setIssuanceError("");
    setCreatedCertificate(null);
    setTransactionHash("");

    let savedCertificate: CertificateRecord | null = null;
    let walletChecked = false;
    let submittedHash = "";

    try {
      // Check the wallet before saving so a wrong account never leaves a certificate without an on-chain record.
      const signer = await getLinkedWalletSigner(linkedWallet);
      walletChecked = true;

      setIssuanceState("creating");
      setIssuanceMessage("Saving certificate details...");
      const certificate = await createInstitutionCertificate({
        studentId: form.studentId,
        certificateType: form.certificateType.trim(),
        programName: form.programName.trim(),
        classification: form.classification.trim() || undefined,
        issueDate: form.issueDate,
        graduationDate: form.graduationDate || undefined,
      });
      savedCertificate = certificate;
      setCreatedCertificate(certificate);
      setCertificates((current) => [certificate, ...current.filter((item) => item.id !== certificate.id)]);
      setForm(emptyCertificateForm());

      const outcome = await submitOnChainStep({
        certificate,
        txType: "ISSUE",
        signer,
        onPhase: (phase) => { setIssuanceState(phase); setIssuanceMessage(onChainPhaseMessages[phase]); },
        onTransactionHash: (hash) => { submittedHash = hash; setTransactionHash(hash); },
      });
      const { message, error } = outcomeText(outcome, "ISSUE");
      setIssuanceState(outcome);
      setIssuanceMessage(message);
      setIssuanceError(error);
    } catch (error) {
      setIssuanceState(isWalletRejection(error) ? "cancelled" : "failed");
      setIssuanceMessage("");
      if (savedCertificate) setIssuanceError(`${describeOnChainFailure(error, submittedHash)} ${ISSUE_INCOMPLETE_NOTE}`);
      else if (walletChecked) setIssuanceError(errorMessage(error));
      else setIssuanceError(`${describeOnChainFailure(error, "")} No certificate was created.`);
    } finally {
      if (savedCertificate) await refreshCertificates();
    }
  }

  async function runOnChainStep(certificate: CertificateRecord, txType: BlockchainTxType) {
    let submittedHash = "";
    try {
      updateRowAction({ phase: "wallet-check", message: onChainPhaseMessages["wallet-check"], error: "" });
      const signer = await getLinkedWalletSigner(linkedWallet);
      const outcome = await submitOnChainStep({
        certificate,
        txType,
        signer,
        onPhase: (phase) => updateRowAction({ phase, message: onChainPhaseMessages[phase] }),
        onTransactionHash: (hash) => { submittedHash = hash; updateRowAction({ transactionHash: hash }); },
      });
      updateRowAction({ phase: outcome, ...outcomeText(outcome, txType) });
    } catch (error) {
      updateRowAction({
        phase: isWalletRejection(error) ? "cancelled" : "failed",
        message: "",
        error: `${describeOnChainFailure(error, submittedHash)} ${txType === "ISSUE" ? ISSUE_INCOMPLETE_NOTE : REVOKE_INCOMPLETE_NOTE}`,
      });
    } finally {
      await refreshCertificates();
    }
  }

  function openRowAction(certificateId: string, kind: RowAction["kind"]) {
    setRowAction({ certificateId, kind, phase: "form", reason: "", reasonError: "", message: "", error: "", transactionHash: "" });
  }

  async function handleRevoke(event: FormEvent<HTMLFormElement>, certificate: CertificateRecord) {
    event.preventDefault();
    const reason = rowAction?.reason.trim() ?? "";
    if (!reason) {
      updateRowAction({ reasonError: "Enter a reason for revoking this certificate." });
      return;
    }

    updateRowAction({ phase: "revoking", reasonError: "", message: "Revoking the certificate in the database...", error: "" });
    let revoked: CertificateRecord;
    try {
      revoked = await revokeInstitutionCertificate(certificate.id, reason);
    } catch (error) {
      updateRowAction({ phase: "failed", message: "", error: `The certificate could not be revoked: ${errorMessage(error)}. Nothing was changed.` });
      return;
    }

    const updated = { ...certificate, ...revoked, onChain: certificate.onChain };
    setCertificates((current) => current.map((item) => (item.id === certificate.id ? updated : item)));

    // The contract reverts when revoking a certificate it has never recorded, so don't send a transaction that can't succeed.
    if (chainState(certificate.onChain?.issue) !== "confirmed") {
      updateRowAction({
        phase: "stopped",
        message: "",
        error: "The certificate is revoked in the database. Its issuance is not confirmed on-chain, so there is no on-chain record to revoke yet. Once the issuance is confirmed (use “Check status” if it is pending, or “Retry on-chain step” if it is missing or failed), use “Retry on-chain step” again to record the revocation.",
      });
      await refreshCertificates();
      return;
    }

    await runOnChainStep(updated, "REVOKE");
  }

  async function handleRetry(certificate: CertificateRecord) {
    openRowAction(certificate.id, "retry");
    await runOnChainStep(certificate, currentChainStep(certificate).txType);
  }

  async function handleCheckStatus(certificate: CertificateRecord) {
    setCheckingStatusId(certificate.id);
    try {
      // The status endpoint refreshes pending transactions from the chain; the list then reflects the result.
      await getInstitutionCertificateBlockchainStatus(certificate.id);
      await refreshCertificates();
    } catch (error) {
      setListError(errorMessage(error));
    } finally {
      setCheckingStatusId("");
    }
  }

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
            <button className="button-primary sm:col-span-2" disabled={isBusy} type="submit">
              {busyPhases.includes(issuanceState) ? "Issuing certificate..." : "Create and issue certificate"}
            </button>
          </form>
        )}

        <OnChainProgress
          error={issuanceError}
          extra={createdCertificate && issuanceError ? <span className="mt-1 block">Saved certificate ID: <span className="font-mono">{createdCertificate.certificateUid}</span></span> : null}
          isConfirmed={issuanceState === "confirmed"}
          message={issuanceMessage}
          transactionHash={transactionHash}
        />
      </section>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">Issued certificates</h2>
            <p className="mt-1 text-sm text-slate-600">Database status and the on-chain record for each certificate.</p>
          </div>
          <button className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => void refreshCertificates()} type="button">Refresh list</button>
        </div>
        {listError && <p className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{listError}</p>}
        {certificates.length === 0 ? (
          <p className="mt-4 rounded-md bg-slate-50 p-4 text-sm text-slate-600">No certificates have been issued yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-md border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-600"><tr><th className="px-4 py-3 font-semibold">Student</th><th className="px-4 py-3 font-semibold">Type</th><th className="px-4 py-3 font-semibold">Program</th><th className="px-4 py-3 font-semibold">Issue date</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3 font-semibold">On-chain</th><th className="px-4 py-3 font-semibold"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {certificates.map((certificate) => {
                  const step = currentChainStep(certificate);
                  const action = rowAction?.certificateId === certificate.id ? rowAction : null;
                  return (
                    <CertificateRows
                      action={action}
                      certificate={certificate}
                      isBusy={isBusy}
                      isCheckingStatus={checkingStatusId === certificate.id}
                      key={certificate.id}
                      onCheckStatus={() => void handleCheckStatus(certificate)}
                      onClose={() => setRowAction(null)}
                      onReasonChange={(reason) => updateRowAction({ reason, reasonError: "" })}
                      onRetry={() => void handleRetry(certificate)}
                      onRevokeOpen={() => openRowAction(certificate.id, "revoke")}
                      onRevokeSubmit={(event) => void handleRevoke(event, certificate)}
                      step={step}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

const chainStateClasses: Record<ChainState, string> = {
  confirmed: "bg-emerald-100 text-emerald-800",
  pending: "bg-sky-100 text-sky-900",
  failed: "bg-red-100 text-red-800",
  missing: "bg-amber-100 text-amber-900",
};

function CertificateRows({
  certificate,
  step,
  action,
  isBusy,
  isCheckingStatus,
  onRevokeOpen,
  onRevokeSubmit,
  onReasonChange,
  onRetry,
  onCheckStatus,
  onClose,
}: {
  certificate: CertificateRecord;
  step: ReturnType<typeof currentChainStep>;
  action: RowAction | null;
  isBusy: boolean;
  isCheckingStatus: boolean;
  onRevokeOpen: () => void;
  onRevokeSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onReasonChange: (reason: string) => void;
  onRetry: () => void;
  onCheckStatus: () => void;
  onClose: () => void;
}) {
  const stepLabel = step.txType === "ISSUE" ? "Issuance" : "Revocation";
  const actionInProgress = action !== null && busyPhases.includes(action.phase);
  const reasonErrorId = `revoke-reason-error-${certificate.id}`;

  return (
    <>
      <tr>
        <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">{certificate.student.fullName}<span className="block text-xs font-normal text-slate-500">{certificate.student.studentNumber}</span></td>
        <td className="px-4 py-3 text-slate-700">{certificate.certificateType}</td>
        <td className="px-4 py-3 text-slate-700">{certificate.programName}</td>
        <td className="whitespace-nowrap px-4 py-3 text-slate-700">{formatDate(certificate.issueDate)}</td>
        <td className="whitespace-nowrap px-4 py-3"><span className={certificate.status === "ACTIVE" ? "font-semibold text-emerald-700" : "font-semibold text-slate-600"}>{certificate.status === "ACTIVE" ? "Active" : "Revoked"}</span></td>
        <td className="whitespace-nowrap px-4 py-3">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${chainStateClasses[step.state]}`}>{stepLabel} {step.state}</span>
          {step.txHash && <a className="ml-2 text-xs font-semibold text-teal-700 underline" href={`${EXPLORER_TX_URL}${step.txHash}`} rel="noreferrer" target="_blank">Tx</a>}
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-right">
          <div className="flex justify-end gap-2">
            {(step.state === "missing" || step.state === "failed") && (
              <button className="rounded-md border border-teal-600 px-3 py-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-50 disabled:opacity-50" disabled={isBusy} onClick={onRetry} type="button">Retry on-chain step</button>
            )}
            {step.state === "pending" && (
              <button className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50" disabled={isCheckingStatus} onClick={onCheckStatus} type="button">{isCheckingStatus ? "Checking..." : "Check status"}</button>
            )}
            {certificate.status === "ACTIVE" && (
              <button className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50" disabled={isBusy} onClick={onRevokeOpen} type="button">Revoke</button>
            )}
          </div>
        </td>
      </tr>
      {action && (
        <tr className="bg-slate-50">
          <td className="px-4 py-4" colSpan={7}>
            {action.kind === "revoke" && action.phase === "form" ? (
              <form className="max-w-2xl space-y-3" noValidate onSubmit={onRevokeSubmit}>
                <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm leading-6 text-red-900">
                  <p className="font-semibold">Revoke this certificate for {certificate.student.fullName}?</p>
                  <p>Revocation is permanent and cannot be undone. Every employer or verifier who checks this certificate will see it as revoked, together with the reason you give below.</p>
                </div>
                <label className="block text-sm font-medium text-slate-700" htmlFor={`revoke-reason-${certificate.id}`}>
                  Reason for revocation
                  <textarea
                    aria-describedby={action.reasonError ? reasonErrorId : undefined}
                    aria-invalid={action.reasonError ? true : undefined}
                    className={`field min-h-20 ${action.reasonError ? "border-red-500" : ""}`}
                    id={`revoke-reason-${certificate.id}`}
                    onChange={(event) => onReasonChange(event.target.value)}
                    required
                    value={action.reason}
                  />
                </label>
                {action.reasonError && <p className="text-sm text-red-700" id={reasonErrorId} role="alert">{action.reasonError}</p>}
                <div className="flex gap-2">
                  <button className="rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800" type="submit">Revoke certificate</button>
                  <button className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-white" onClick={onClose} type="button">Cancel</button>
                </div>
              </form>
            ) : (
              <div className="max-w-2xl">
                <p className="text-sm font-semibold text-slate-900">{action.kind === "revoke" ? "Revoking certificate" : "Retrying on-chain step"}</p>
                <OnChainProgress error={action.error} isConfirmed={action.phase === "confirmed"} message={action.message} transactionHash={action.transactionHash} />
                {!actionInProgress && (
                  <button className="mt-3 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white" onClick={onClose} type="button">Close</button>
                )}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function OnChainProgress({ message, error, transactionHash, isConfirmed, extra }: { message: string; error: string; transactionHash: string; isConfirmed: boolean; extra?: ReactNode }) {
  return (
    <>
      {message && <p className={`mt-4 rounded-md px-4 py-3 text-sm ${isConfirmed ? "bg-emerald-50 text-emerald-800" : "bg-sky-50 text-sky-900"}`} role="status">{message}</p>}
      {error && <p className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950" role="alert">{error}{extra}</p>}
      {transactionHash && (
        <p className="mt-3 break-all text-sm text-slate-600">
          {isConfirmed ? "View transaction on PolygonScan: " : "Transaction: "}
          <a className="font-semibold text-teal-700 underline" href={`${EXPLORER_TX_URL}${transactionHash}`} rel="noreferrer" target="_blank">{transactionHash}</a>
        </p>
      )}
    </>
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
