"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  getAdminInstitutions,
  grantAdminInstitutionIssuer,
  revokeAdminInstitutionIssuer,
  setAdminInstitutionVerification,
  type AdminInstitution,
  type AdminInstitutionFilters,
} from "@/lib/api";
import { EXPLORER_TX_URL } from "@/lib/onChain";
import { shortenAddress } from "@/lib/wallet";

const PAGE_SIZE = 20;

type ActionKind = "verify" | "unverify" | "grant" | "revoke";
type ActionPhase = "confirm" | "running" | "done" | "pending" | "error";

interface PendingAction {
  kind: ActionKind;
  institution: AdminInstitution;
  phase: ActionPhase;
  message: string;
  transactionHash: string;
}

/** Why "Grant issuer access" is unavailable, or "" when it can be used. */
function grantBlocker(institution: AdminInstitution) {
  if (!institution.isVerified) return "Institution must be verified";
  if (!institution.walletAddress) return "Institution has no linked wallet";
  if (institution.isIssuer === true) return "Already an approved issuer";
  if (institution.isIssuer === null) return "On-chain status could not be read; refresh to retry";
  return "";
}

/** Why "Revoke issuer access" is unavailable, or "" when it can be used. */
function revokeBlocker(institution: AdminInstitution) {
  if (!institution.walletAddress) return "Institution has no linked wallet";
  if (institution.isIssuer === false) return "Not currently an issuer";
  if (institution.isIssuer === null) return "On-chain status could not be read; refresh to retry";
  return "";
}

function IssuerBadge({ institution }: { institution: AdminInstitution }) {
  if (!institution.walletAddress) return <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">No wallet</span>;
  if (institution.isIssuer === true) return <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">Approved</span>;
  if (institution.isIssuer === false) return <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700">Not approved</span>;
  return <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900" title="The blockchain could not be read in time">Unknown</span>;
}

export function AdminInstitutions({ initialVerified = "" }: { initialVerified?: AdminInstitutionFilters["verified"] }) {
  const [institutions, setInstitutions] = useState<AdminInstitution[]>([]);
  const [filters, setFilters] = useState<AdminInstitutionFilters>({ verified: initialVerified, search: "" });
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [action, setAction] = useState<PendingAction | null>(null);

  useEffect(() => {
    let active = true;
    void getAdminInstitutions(page, PAGE_SIZE, filters)
      .then((response) => {
        if (!active) return;
        setInstitutions(response.institutions);
        setTotalPages(Math.max(response.pagination.totalPages, 1));
      })
      .catch((requestError: unknown) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "Institutions could not be loaded.");
      })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [filters, page, reloadKey]);

  function startLoading() {
    setIsLoading(true);
    setError("");
  }

  function changePage(nextPage: number) {
    startLoading();
    setPage(nextPage);
  }

  function changeVerifiedFilter(verified: AdminInstitutionFilters["verified"]) {
    startLoading();
    setFilters((current) => ({ ...current, verified }));
    setPage(1);
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startLoading();
    setFilters((current) => ({ ...current, search: searchInput.trim() }));
    setPage(1);
  }

  // Reloads the current page without blanking the table, so updated badges replace the old ones in place.
  function refreshTable() {
    setError("");
    setReloadKey((key) => key + 1);
  }

  async function runAction() {
    if (!action) return;
    const { kind, institution } = action;
    setAction({ ...action, phase: "running", message: kind === "grant" || kind === "revoke" ? "Sending the transaction from the administrator wallet and waiting for it to be mined..." : "Saving..." });

    try {
      if (kind === "verify" || kind === "unverify") {
        await setAdminInstitutionVerification(institution.id, kind === "verify");
        setAction({ ...action, phase: "done", message: kind === "verify" ? `${institution.name} is now verified.` : `${institution.name} is now unverified.`, transactionHash: "" });
      } else {
        const result = kind === "grant" ? await grantAdminInstitutionIssuer(institution.id) : await revokeAdminInstitutionIssuer(institution.id);
        if (result.status === "PENDING") {
          setAction({ ...action, phase: "pending", message: "Transaction submitted, still pending. Refresh the row in a minute to see the final on-chain status.", transactionHash: result.transactionHash });
        } else {
          setAction({ ...action, phase: "done", message: kind === "grant" ? `Issuer access granted to ${institution.name}.` : `Issuer access revoked from ${institution.name}.`, transactionHash: result.transactionHash });
        }
      }
    } catch (requestError) {
      setAction({ ...action, phase: "error", message: requestError instanceof Error ? requestError.message : "The action could not be completed.", transactionHash: "" });
    } finally {
      refreshTable();
    }
  }

  const hasFilters = Boolean(filters.verified || filters.search);

  return (
    <section>
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">Platform administration</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">Institutions</h1>
        <p className="mt-2 text-slate-600">Verify institutions and manage their authority to issue certificates on the blockchain.</p>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-[12rem_1fr] sm:items-end">
        <label className="block text-sm font-medium text-slate-700" htmlFor="institutions-verified">
          Verification
          <select className="field" id="institutions-verified" onChange={(event) => changeVerifiedFilter(event.target.value as AdminInstitutionFilters["verified"])} value={filters.verified}>
            <option value="">All</option>
            <option value="true">Verified</option>
            <option value="false">Unverified</option>
          </select>
        </label>
        <form className="flex items-end gap-2" onSubmit={handleSearch} role="search">
          <label className="block min-w-0 flex-1 text-sm font-medium text-slate-700" htmlFor="institutions-search">
            Search by name or registration number
            <input className="field" id="institutions-search" onChange={(event) => setSearchInput(event.target.value)} type="search" value={searchInput} />
          </label>
          <button className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" type="submit">Search</button>
        </form>
      </div>

      {error && <p className="mt-6 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</p>}
      {isLoading ? (
        <p className="mt-6 text-sm text-slate-600">Loading institutions...</p>
      ) : error ? null : institutions.length === 0 ? (
        <p className="mt-6 rounded-md bg-slate-50 p-5 text-sm text-slate-600 ring-1 ring-slate-200">
          {hasFilters ? "No institutions match these filters." : "No institutions have registered yet."}
        </p>
      ) : (
        <>
          <div className="mt-6 overflow-x-auto rounded-md border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Registration no.</th>
                  <th className="px-4 py-3 font-semibold">Verified</th>
                  <th className="px-4 py-3 font-semibold">Wallet</th>
                  <th className="px-4 py-3 font-semibold">On-chain issuer</th>
                  <th className="px-4 py-3 font-semibold">Certificates</th>
                  <th className="px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {institutions.map((institution) => (
                  <InstitutionRow institution={institution} key={institution.id} onAction={(kind) => setAction({ kind, institution, phase: "confirm", message: "", transactionHash: "" })} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between gap-4 text-sm text-slate-600">
            <span>Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <button className="rounded-md border border-slate-300 px-3 py-2 font-medium hover:bg-white disabled:opacity-50" disabled={page <= 1} onClick={() => changePage(page - 1)} type="button">Previous</button>
              <button className="rounded-md border border-slate-300 px-3 py-2 font-medium hover:bg-white disabled:opacity-50" disabled={page >= totalPages} onClick={() => changePage(page + 1)} type="button">Next</button>
            </div>
          </div>
        </>
      )}

      {action && <ActionDialog action={action} onClose={() => setAction(null)} onConfirm={() => void runAction()} onRefresh={refreshTable} />}
    </section>
  );
}

function InstitutionRow({ institution, onAction }: { institution: AdminInstitution; onAction: (kind: ActionKind) => void }) {
  const grantReason = grantBlocker(institution);
  const revokeReason = revokeBlocker(institution);
  const reasonsId = `institution-action-reasons-${institution.id}`;
  const reasons = [grantReason && `Grant: ${grantReason}.`, revokeReason && `Revoke: ${revokeReason}.`].filter(Boolean);

  return (
    <tr className="align-top">
      <td className="px-4 py-3 font-medium text-slate-900">
        {institution.name}
        {institution.contactEmail && <span className="block break-all text-xs font-normal text-slate-500">{institution.contactEmail}</span>}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-slate-700">{institution.registrationNumber}</td>
      <td className="whitespace-nowrap px-4 py-3">
        {institution.isVerified
          ? <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">Verified</span>
          : <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">Unverified</span>}
      </td>
      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-700">
        {institution.walletAddress ? <span title={institution.walletAddress}>{shortenAddress(institution.walletAddress)}</span> : <span className="font-sans text-slate-400">None</span>}
      </td>
      <td className="whitespace-nowrap px-4 py-3"><IssuerBadge institution={institution} /></td>
      <td className="px-4 py-3 text-slate-700">{institution.certificatesIssued}</td>
      <td className="px-4 py-3">
        <div className="flex min-w-48 flex-col gap-2">
          <button className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50" onClick={() => onAction(institution.isVerified ? "unverify" : "verify")} type="button">
            {institution.isVerified ? "Unverify" : "Verify"}
          </button>
          <button
            aria-describedby={grantReason ? reasonsId : undefined}
            className="rounded-md bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
            disabled={Boolean(grantReason)}
            onClick={() => onAction("grant")}
            title={grantReason || undefined}
            type="button"
          >
            Grant issuer access
          </button>
          <button
            aria-describedby={revokeReason ? reasonsId : undefined}
            className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 disabled:hover:bg-transparent"
            disabled={Boolean(revokeReason)}
            onClick={() => onAction("revoke")}
            title={revokeReason || undefined}
            type="button"
          >
            Revoke issuer access
          </button>
          {reasons.length > 0 && <p className="text-xs leading-5 text-slate-500" id={reasonsId}>{reasons.join(" ")}</p>}
        </div>
      </td>
    </tr>
  );
}

const dialogCopy: Record<ActionKind, { title: (name: string) => string; body: (institution: AdminInstitution) => string; confirm: string; tone: "default" | "danger" }> = {
  verify: {
    title: (name) => `Verify ${name}?`,
    body: () => "This marks the institution as verified. It does not grant issuer access on the blockchain by itself; that is a separate step.",
    confirm: "Verify institution",
    tone: "default",
  },
  unverify: {
    title: (name) => `Unverify ${name}?`,
    body: (institution) => institution.isIssuer
      ? "This only changes the verified flag. The institution currently holds issuer access on the blockchain and keeps it until you revoke it separately."
      : "This only changes the verified flag. The institution will need to be verified again before it can be granted issuer access.",
    confirm: "Unverify institution",
    tone: "danger",
  },
  grant: {
    title: (name) => `Grant issuer access to ${name}?`,
    body: (institution) => `This sends a blockchain transaction from the administrator wallet that allows ${institution.walletAddress ?? "the institution's wallet"} to issue and revoke certificates on-chain. It can take up to a minute to confirm.`,
    confirm: "Grant issuer access",
    tone: "default",
  },
  revoke: {
    title: (name) => `Revoke issuer access from ${name}?`,
    body: () => "This sends a blockchain transaction that removes the institution's issuer role. It will no longer be able to issue new certificates or revoke existing ones on-chain. Certificates it has already issued stay valid and verifiable.",
    confirm: "Revoke issuer access",
    tone: "danger",
  },
};

function ActionDialog({ action, onConfirm, onClose, onRefresh }: { action: PendingAction; onConfirm: () => void; onClose: () => void; onRefresh: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const copy = dialogCopy[action.kind];
  const isRunning = action.phase === "running";
  const isOnChain = action.kind === "grant" || action.kind === "revoke";

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const statusClasses: Record<Exclude<ActionPhase, "confirm">, string> = {
    running: "bg-sky-50 text-sky-900",
    done: "bg-emerald-50 text-emerald-800",
    pending: "bg-amber-50 text-amber-950",
    error: "bg-red-50 text-red-800",
  };

  return (
    <dialog
      aria-labelledby="admin-action-title"
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl bg-white p-6 text-slate-900 shadow-xl backdrop:bg-slate-950/40"
      // Escape must not abandon an action that is still running.
      onCancel={(event) => { if (isRunning) event.preventDefault(); else onClose(); }}
      ref={dialogRef}
    >
      <h2 className="text-xl font-semibold text-slate-950" id="admin-action-title">{copy.title(action.institution.name)}</h2>
      <p className={`mt-3 text-sm leading-6 ${copy.tone === "danger" ? "text-red-900" : "text-slate-600"}`}>{copy.body(action.institution)}</p>

      {action.phase !== "confirm" && (
        <p className={`mt-4 rounded-md px-4 py-3 text-sm leading-6 ${statusClasses[action.phase]}`} role={action.phase === "error" ? "alert" : "status"}>
          {action.message}
        </p>
      )}
      {action.transactionHash && (
        <p className="mt-3 break-all text-sm text-slate-600">
          {action.phase === "done" ? "View transaction on PolygonScan: " : "Transaction: "}
          <a className="font-semibold text-teal-700 underline" href={`${EXPLORER_TX_URL}${action.transactionHash}`} rel="noreferrer" target="_blank">{action.transactionHash}</a>
        </p>
      )}

      <div className="mt-6 flex flex-wrap justify-end gap-2">
        {action.phase === "confirm" && (
          <>
            <button className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={onClose} type="button">Cancel</button>
            <button
              className={`rounded-md px-4 py-2 text-sm font-semibold text-white ${copy.tone === "danger" ? "bg-red-700 hover:bg-red-800" : "bg-teal-700 hover:bg-teal-800"}`}
              onClick={onConfirm}
              type="button"
            >
              {copy.confirm}
            </button>
          </>
        )}
        {isRunning && <button className="rounded-md bg-slate-300 px-4 py-2 text-sm font-semibold text-slate-600" disabled type="button">{isOnChain ? "Waiting for the blockchain..." : "Saving..."}</button>}
        {action.phase === "pending" && <button className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={onRefresh} type="button">Refresh row</button>}
        {(action.phase === "done" || action.phase === "pending" || action.phase === "error") && (
          <button className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800" onClick={onClose} type="button">Close</button>
        )}
      </div>
    </dialog>
  );
}
