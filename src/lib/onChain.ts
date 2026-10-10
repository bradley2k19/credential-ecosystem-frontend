import type { JsonRpcSigner } from "ethers";
import {
  getInstitutionCertificateBlockchainStatus,
  recordInstitutionCertificateTransaction,
  type BlockchainTxType,
  type CertificateRecord,
} from "@/lib/api";
import { getCertificateRegistryContract, getFeeOverrides } from "@/lib/contract";
import { getWalletSigner, isSameAddress, shortenAddress, WalletError } from "@/lib/wallet";

const POLL_INTERVAL_MS = 3500;
const MAX_STATUS_CHECKS = 20;

export const EXPLORER_TX_URL = "https://amoy.polygonscan.com/tx/";

// Shared progress vocabulary for every wallet-signed certificate step (issue, revoke, retry).
export type OnChainPhase = "wallet-check" | "wallet" | "recording" | "confirming";
export type OnChainOutcome = "confirmed" | "failed" | "timed-out";

export const onChainPhaseMessages: Record<OnChainPhase, string> = {
  "wallet-check": "Checking your connected wallet...",
  wallet: "Waiting for wallet confirmation...",
  recording: "Transaction submitted. Recording it with the institution account...",
  confirming: "Transaction recorded. Waiting for blockchain confirmation...",
};

export class WalletMismatchError extends Error {
  constructor(linkedWallet: string | null | undefined, connectedAddress: string) {
    super(linkedWallet
      ? `Connect the wallet linked to your account to complete the on-chain step (Linked: ${shortenAddress(linkedWallet)}, connected: ${shortenAddress(connectedAddress)}). Switch accounts in MetaMask, then try again.`
      : "No wallet is linked to your account. Link one on the Overview page before completing on-chain steps.");
    this.name = "WalletMismatchError";
  }
}

function errorCode(error: unknown) {
  if (typeof error === "object" && error !== null && "code" in error) return error.code;
  return undefined;
}

export function errorMessage(error: unknown) {
  if (typeof error === "object" && error !== null && "shortMessage" in error && typeof error.shortMessage === "string") {
    return error.shortMessage;
  }
  return error instanceof Error ? error.message : "An unexpected error occurred.";
}

export function isWalletRejection(error: unknown) {
  const code = errorCode(error);
  const message = errorMessage(error).toLowerCase();
  return code === 4001 || code === "ACTION_REJECTED" || message.includes("user rejected") || message.includes("user denied");
}

/** True when the RPC node refused the transaction because its fee was under the network minimum. */
function isFeeRejection(error: unknown) {
  // The RPC text can sit in the message or in nested wallet/RPC error objects, so search all of it.
  let details = "";
  try {
    details = JSON.stringify(error) ?? "";
  } catch {
    // Circular error objects fall back to the message alone.
  }
  const text = `${errorMessage(error)} ${error instanceof Error ? error.message : ""} ${details}`.toLowerCase();
  return text.includes("gas price below minimum") || text.includes("gas tip cap");
}

/** Explains why an on-chain step stopped. Callers append what state the database is in. */
export function describeOnChainFailure(error: unknown, transactionHash: string) {
  if (isWalletRejection(error)) return "The wallet request was cancelled, so no transaction was sent.";
  if (error instanceof WalletMismatchError || error instanceof WalletError) return error.message;
  if (isFeeRejection(error)) return "The network rejected the transaction fee. Please retry.";
  if (transactionHash) return `The transaction was submitted, but tracking it failed: ${errorMessage(error)}.`;
  return `The blockchain step could not be completed: ${errorMessage(error)}.`;
}

/** Returns a signer only if the connected MetaMask account is the wallet linked to the institution. */
export async function getLinkedWalletSigner(linkedWallet: string | null | undefined): Promise<JsonRpcSigner> {
  const signer = await getWalletSigner();
  const connectedAddress = await signer.getAddress();
  if (!isSameAddress(linkedWallet, connectedAddress)) throw new WalletMismatchError(linkedWallet, connectedAddress);
  return signer;
}

export async function pollTransactionStatus(certificateId: string, txType: BlockchainTxType, transactionHash: string): Promise<OnChainOutcome> {
  for (let attempt = 0; attempt < MAX_STATUS_CHECKS; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const statusResponse = await getInstitutionCertificateBlockchainStatus(certificateId);
    const status = statusResponse.transactions.find(
      (item) => item.txHash.toLowerCase() === transactionHash.toLowerCase() && item.txType === txType,
    )?.status;
    if (status === "CONFIRMED") return "confirmed";
    if (status === "FAILED") return "failed";
  }
  return "timed-out";
}

/** Signs the contract call for `txType`, reports the hash to the backend, then polls until it settles. */
export async function submitOnChainStep({
  certificate,
  txType,
  signer,
  onPhase,
  onTransactionHash,
}: {
  certificate: Pick<CertificateRecord, "id" | "certificateUid" | "certificateHash">;
  txType: BlockchainTxType;
  signer: JsonRpcSigner;
  onPhase: (phase: OnChainPhase) => void;
  onTransactionHash: (hash: string) => void;
}): Promise<OnChainOutcome> {
  const contract = getCertificateRegistryContract(signer);

  onPhase("wallet");
  // Always use the stored UID and hash; never recompute them in the browser.
  const feeOverrides = await getFeeOverrides(signer.provider);
  const transaction = txType === "ISSUE"
    ? await contract.issueCertificate(certificate.certificateUid, certificate.certificateHash, feeOverrides)
    : await contract.revokeCertificate(certificate.certificateUid, feeOverrides);
  onTransactionHash(transaction.hash);

  onPhase("recording");
  await recordInstitutionCertificateTransaction(certificate.id, txType, transaction.hash);

  onPhase("confirming");
  return pollTransactionStatus(certificate.id, txType, transaction.hash);
}
