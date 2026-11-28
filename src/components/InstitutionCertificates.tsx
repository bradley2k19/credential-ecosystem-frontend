"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { CertificatePreviewDialog } from "@/components/certificate/CertificatePreviewDialog";
import {
  effectiveTemplateId,
  IssuancePreview,
  isTemplateProblem,
  TemplatePicker,
  TemplateProblem,
  type IssuanceTemplates,
} from "@/components/certificate/IssuanceTemplate";
import { useInstitutionProfile } from "@/context/InstitutionProfileContext";
import { CorrectionStageBadge } from "@/components/corrections/CorrectionStageBadge";
import {
  createInstitutionCertificate,
  getInstitutionCertificate,
  getInstitutionCertificateBlockchainStatus,
  getInstitutionCertificates,
  getInstitutionCorrectionRequest,
  getInstitutionIssuerStatus,
  getInstitutionStudents,
  getInstitutionTemplates,
  getSignatories,
  getTemplateOptions,
  revokeInstitutionCertificate,
  type BlockchainTxType,
  type CertificateRecord,
  type InstitutionCertificateDetail,
  type InstitutionCorrectionRequest,
  type IssuerStatus,
  type OnChainTransactionSummary,
  type StudentRecord,
} from "@/lib/api";
import { pendingCorrections } from "@/lib/liveCounts";
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

/** The correction being reissued (opened with ?correct=<requestId>): the request and its original certificate. */
interface CorrectionContext {
  request: InstitutionCorrectionRequest;
  original: InstitutionCertificateDetail;
}

const replacementReason = (newUid: string) => `Replaced by corrected certificate ${newUid} after a correction request`;

/** The correction request, its original certificate, and that student's certificates (to list the original). */
async function fetchCorrection(requestId: string) {
  const request = await getInstitutionCorrectionRequest(requestId);
  const original = await getInstitutionCertificate(request.certificate.id);
  const forStudent = original.studentId ? (await getInstitutionCertificates({ studentId: original.studentId })).certificates : [];
  return { request, original, forStudent };
}

/**
 * `correctRequestId` opens the page for reissuing an approved correction request (the form prefilled from the
 * original certificate, the student locked); `initialPreviewId` opens the preview of one certificate.
 */
export function InstitutionCertificates({ correctRequestId, initialPreviewId }: { correctRequestId?: string; initialPreviewId?: string } = {}) {
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
  const [previewCertificateId, setPreviewCertificateId] = useState(initialPreviewId ?? "");
  const [correction, setCorrection] = useState<CorrectionContext | null>(null);
  const [correctionError, setCorrectionError] = useState("");
  // The replacement issued during this visit, until the request reflects it.
  const [replacement, setReplacement] = useState<CertificateRecord | null>(null);
  const { profile } = useInstitutionProfile();
  // Templates for the issuance form: null while loading. chosenTemplateId is null until the user picks one,
  // so the default template stays preselected; "" means the built-in Classic design (no templateId sent).
  const [templateChoices, setTemplateChoices] = useState<IssuanceTemplates | null>(null);
  const [templatesError, setTemplatesError] = useState("");
  const [chosenTemplateId, setChosenTemplateId] = useState<string | null>(null);
  const [templateProblem, setTemplateProblem] = useState<{ message: string; templateId: string } | null>(null);

  const linkedWallet = issuerStatus?.walletAddress;
  const selectedTemplateId = templateChoices ? effectiveTemplateId(templateChoices.templates, chosenTemplateId) : "";
  const isBusy = busyPhases.includes(issuanceState) || (rowAction !== null && busyPhases.includes(rowAction.phase));
  // Reissuing: only an approved request without a replacement yet. The student is then fixed.
  const isReissuing = correction?.request.stage === "approved_awaiting_reissue" && !replacement;

  /** Shows a loaded correction; with `prefill`, fills the form from the original certificate (approved requests). */
  function applyCorrection({ request, original, forStudent }: Awaited<ReturnType<typeof fetchCorrection>>, prefill: boolean) {
    setCorrection({ request, original });
    setCorrectionError("");
    if (prefill && request.stage === "approved_awaiting_reissue") {
      setForm({
        studentId: original.studentId ?? "",
        certificateType: original.certificateType,
        programName: original.programName,
        classification: original.classification ?? "",
        issueDate: original.issueDate.slice(0, 10),
        graduationDate: original.graduationDate ? original.graduationDate.slice(0, 10) : "",
      });
      setChosenTemplateId(original.templateId ?? "");
    }
    // The original may be older than the newest 100: make sure its row (and so its revoke panel) is listed.
    setCertificates((current) => [...current, ...forStudent.filter((item) => !current.some((existing) => existing.id === item.id))]);
  }

  /** Reloads the correction after the replacement is issued or the original revoked. */
  async function loadCorrection(requestId: string, prefill: boolean) {
    try {
      applyCorrection(await fetchCorrection(requestId), prefill);
    } catch (error) {
      setCorrectionError(errorMessage(error));
    }
  }

  useEffect(() => {
    // Waits for the issuer check (and the first load), so the prefilled form is not overwritten by it.
    if (!correctRequestId || isCheckingApproval || !issuerStatus?.isIssuer) return;
    let active = true;
    void fetchCorrection(correctRequestId).then(
      (loaded) => { if (active) applyCorrection(loaded, true); },
      (error: unknown) => { if (active) setCorrectionError(errorMessage(error)); },
    );
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per request, after the issuer check
  }, [correctRequestId, isCheckingApproval]);

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

  // Templates can change in another tab (for example after following "Edit the template"), so they are loaded
  // again whenever this window regains focus. A failure here never blocks issuing.
  useEffect(() => {
    let isCurrent = true;
    const loadTemplates = () => {
      void Promise.all([getInstitutionTemplates(false), getTemplateOptions(), getSignatories()])
        .then(([templateResponse, options, signatoryResponse]) => {
          if (!isCurrent) return;
          setTemplateChoices({ templates: templateResponse.templates, options, signatories: signatoryResponse.signatories });
          setTemplatesError("");
        })
        .catch((error: unknown) => { if (isCurrent) setTemplatesError(errorMessage(error)); });
    };
    loadTemplates();
    window.addEventListener("focus", loadTemplates);
    return () => {
      isCurrent = false;
      window.removeEventListener("focus", loadTemplates);
    };
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
    setTemplateProblem(null);
    setCreatedCertificate(null);
    setTransactionHash("");

    let savedCertificate: CertificateRecord | null = null;
    let walletChecked = false;
    let submittedHash = "";
    const submittedTemplateId = selectedTemplateId;
    const submittedCorrectionId = isReissuing ? correction?.request.id : undefined;

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
        templateId: submittedTemplateId || undefined,
        correctionRequestId: submittedCorrectionId,
      });
      savedCertificate = certificate;
      setCreatedCertificate(certificate);
      if (submittedCorrectionId) setReplacement(certificate);
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
      else if (walletChecked && isTemplateProblem(errorMessage(error))) {
        // Refused before anything was saved: the form is kept as typed, with a link to fix the template.
        setTemplateProblem({ message: errorMessage(error), templateId: submittedTemplateId });
      } else if (walletChecked) setIssuanceError(errorMessage(error));
      else setIssuanceError(`${describeOnChainFailure(error, "")} No certificate was created.`);
    } finally {
      if (savedCertificate) await refreshCertificates();
      // The request now has its replacement: show the next step (revoking the original).
      if (savedCertificate && submittedCorrectionId) await loadCorrection(submittedCorrectionId, false);
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

  function openRowAction(certificateId: string, kind: RowAction["kind"], reason = "") {
    setRowAction({ certificateId, kind, phase: "form", reason, reasonError: "", message: "", error: "", transactionHash: "" });
  }

  /** The prompt after a replacement: opens the usual revoke panel on the original, with the reason filled in. */
  function revokeOriginal() {
    if (!correction) return;
    const newUid = replacement?.certificateUid ?? correction.request.replacement?.certificateUid ?? "";
    openRowAction(correction.original.id, "revoke", replacementReason(newUid));
    window.requestAnimationFrame(() => {
      document.getElementById(`certificate-row-${correction.original.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
      document.getElementById(`revoke-reason-${correction.original.id}`)?.focus();
    });
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
    // Revoking the original of a correction completes it.
    if (correction && correction.original.id === certificate.id) {
      void loadCorrection(correction.request.id, false);
      void pendingCorrections.refresh();
    }

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
        <h2 className="text-xl font-semibold text-slate-950">{isReissuing ? "Issue the corrected certificate" : "Issue a certificate"}</h2>
        <p className="mt-2 text-sm text-slate-600">The certificate is saved first, then submitted to Polygon Amoy from your connected wallet.</p>

        {correctRequestId && correctionError && (
          <p className="mt-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">The correction request could not be loaded: {correctionError}</p>
        )}
        {correction && (
          <CorrectionBanner
            correction={correction}
            isRevoking={rowAction?.certificateId === correction.original.id}
            onRevokeOriginal={revokeOriginal}
            replacement={replacement}
            replacementConfirmed={issuanceState === "confirmed"}
          />
        )}

        {isLoadingData ? <p className="mt-5 text-sm text-slate-600">Loading students and certificates...</p> : students.length === 0 ? (
          <p className="mt-5 rounded-md bg-slate-50 p-4 text-sm text-slate-600">Add a student before issuing a certificate. <Link className="font-semibold text-teal-700 underline" href="/institution/students">Go to Students</Link></p>
        ) : (
          <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
            <label className="block text-sm font-medium text-slate-700 sm:col-span-2" htmlFor="certificate-student">
              Student
              <select className="field disabled:bg-slate-50 disabled:text-slate-600" disabled={isReissuing} id="certificate-student" onChange={(event) => {
                const student = students.find((item) => item.id === event.target.value);
                updateForm("studentId", event.target.value);
                if (student) updateForm("programName", student.programName);
              }} required value={form.studentId}>
                <option value="">Select a student</option>
                {students.map((student) => <option key={student.id} value={student.id}>{student.fullName} ({student.studentNumber})</option>)}
                {/* The corrected student may not be on the first page of the list. */}
                {isReissuing && correction?.original.studentId && !students.some((student) => student.id === correction.original.studentId) && (
                  <option value={correction.original.studentId}>{correction.request.student.fullName} ({correction.request.student.studentNumber})</option>
                )}
              </select>
              {isReissuing && <span className="mt-1 block text-xs font-normal text-slate-500">A corrected certificate goes to the same student as the original.</span>}
            </label>
            <TemplatePicker
              disabled={isBusy}
              loadError={templatesError}
              onChange={(templateId) => { setChosenTemplateId(templateId); setTemplateProblem(null); }}
              templates={templateChoices?.templates ?? null}
              value={selectedTemplateId}
            />
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

        {templateProblem && <TemplateProblem message={templateProblem.message} templateId={templateProblem.templateId} />}
        <OnChainProgress
          error={issuanceError}
          extra={createdCertificate && issuanceError ? <span className="mt-1 block">Saved certificate ID: <span className="font-mono">{createdCertificate.certificateUid}</span></span> : null}
          isConfirmed={issuanceState === "confirmed"}
          message={issuanceMessage}
          transactionHash={transactionHash}
        />

        {!isLoadingData && students.length > 0 && templateChoices && profile && (
          <IssuancePreview
            choices={templateChoices}
            form={form}
            profile={profile}
            student={students.find((student) => student.id === form.studentId)}
            templateId={selectedTemplateId}
          />
        )}
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
              <thead className="bg-slate-50 text-xs uppercase text-slate-600"><tr><th className="px-4 py-3 font-semibold">Student</th><th className="px-4 py-3 font-semibold">Type</th><th className="px-4 py-3 font-semibold">Program</th><th className="px-4 py-3 font-semibold">Issue date</th><th className="px-4 py-3 font-semibold">Template</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3 font-semibold">On-chain</th><th className="px-4 py-3 font-semibold"><span className="sr-only">Actions</span></th></tr></thead>
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
                      onPreview={() => setPreviewCertificateId(certificate.id)}
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
      {previewCertificateId && <CertificatePreviewDialog certificateId={previewCertificateId} onClose={() => setPreviewCertificateId("")} />}
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
  onPreview,
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
  onPreview: () => void;
}) {
  const stepLabel = step.txType === "ISSUE" ? "Issuance" : "Revocation";
  const actionInProgress = action !== null && busyPhases.includes(action.phase);
  const reasonErrorId = `revoke-reason-error-${certificate.id}`;

  return (
    <>
      <tr id={`certificate-row-${certificate.id}`}>
        <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">{certificate.student.fullName}<span className="block text-xs font-normal text-slate-500">{certificate.student.studentNumber}</span></td>
        <td className="px-4 py-3 text-slate-700">{certificate.certificateType}</td>
        <td className="px-4 py-3 text-slate-700">{certificate.programName}</td>
        <td className="whitespace-nowrap px-4 py-3 text-slate-700">{formatDate(certificate.issueDate)}</td>
        <td className="px-4 py-3 text-slate-700">
          {/* The name frozen at issuance; certificates issued before templates existed have none. */}
          {certificate.templateName ? certificate.templateName : <span className="text-slate-500">Not recorded</span>}
        </td>
        <td className="whitespace-nowrap px-4 py-3"><span className={certificate.status === "ACTIVE" ? "font-semibold text-emerald-700" : "font-semibold text-slate-600"}>{certificate.status === "ACTIVE" ? "Active" : "Revoked"}</span></td>
        <td className="whitespace-nowrap px-4 py-3">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${chainStateClasses[step.state]}`}>{stepLabel} {step.state}</span>
          {step.txHash && <a className="ml-2 text-xs font-semibold text-teal-700 underline" href={`${EXPLORER_TX_URL}${step.txHash}`} rel="noreferrer" target="_blank">Tx</a>}
        </td>
        <td className="px-4 py-3 text-right">
          {/* The buttons wrap onto a second line rather than pushing the table wider than the page. */}
          <div className="flex flex-wrap justify-end gap-2 [&>button]:whitespace-nowrap">
            <button className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50" onClick={onPreview} type="button">Preview</button>
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
          <td className="px-4 py-4" colSpan={8}>
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

/**
 * Shown while correcting a certificate: which certificate is being corrected, then (once the replacement exists)
 * the prompt to revoke the original, and finally that the correction is complete.
 */
function CorrectionBanner({ correction, replacement, replacementConfirmed, isRevoking, onRevokeOriginal }: {
  correction: CorrectionContext;
  replacement: CertificateRecord | null;
  replacementConfirmed: boolean;
  isRevoking: boolean;
  onRevokeOriginal: () => void;
}) {
  const { request, original } = correction;
  const replacementUid = replacement?.certificateUid ?? request.replacement?.certificateUid;
  const returnTo = `/institution/certificates?correct=${encodeURIComponent(request.id)}`;
  const editStudentHref = `/institution/students?edit=${encodeURIComponent(original.studentId ?? "")}&returnTo=${encodeURIComponent(returnTo)}`;
  const needsRevocation = Boolean(replacementUid) && original.status === "ACTIVE";

  return (
    <div className="mt-4 space-y-3 rounded-md border border-teal-300 bg-teal-50 px-4 py-3 text-sm text-teal-950" data-correction-banner={request.stage}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold">Correcting certificate <span className="break-all font-mono text-xs">{original.certificateUid}</span></p>
        <CorrectionStageBadge audience="institution" stage={request.stage} />
      </div>
      <p>
        For {request.student.fullName} ({request.student.studentNumber}). The student asked: <span className="italic">&ldquo;{request.requestDetails}&rdquo;</span>
      </p>

      {request.stage === "approved_awaiting_reissue" && !replacement && (
        <p>
          The form below is filled in from the original certificate. If the student&apos;s name is what is wrong,{" "}
          <Link className="font-semibold underline" href={editStudentHref}>edit student details first</Link>: certificates take the student&apos;s current details when issued.
        </p>
      )}
      {(request.stage === "pending" || request.stage === "rejected") && (
        <p className="font-semibold">This request is not approved, so no corrected certificate can be issued for it.</p>
      )}

      {needsRevocation && (
        <div className="space-y-2 rounded-md border border-amber-400 bg-amber-50 p-3 text-amber-950" data-revoke-original-prompt="">
          <p className="text-base font-semibold">Now revoke the original certificate</p>
          <p>
            The corrected certificate <span className="break-all font-mono text-xs">{replacementUid}</span> is issued.
            {replacement && !replacementConfirmed ? " Its on-chain step is not confirmed yet; you may want to finish that first." : ""}{" "}
            Revoke the original so that only the corrected certificate is valid. You confirm and sign the revocation as usual.
          </p>
          <button className="rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60" disabled={isRevoking} onClick={onRevokeOriginal} type="button">
            {isRevoking ? "Revoke panel open below" : "Revoke the original certificate"}
          </button>
        </div>
      )}
      {request.stage === "completed" && <p className="rounded-md bg-emerald-100 px-3 py-2 font-semibold text-emerald-900">Correction completed: the corrected certificate is issued and the original is revoked.</p>}

      <p><Link className="font-semibold underline" href={`/institution/corrections?request=${encodeURIComponent(request.id)}`}>Back to the correction request</Link></p>
    </div>
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
