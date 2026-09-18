"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getInstitutionIssuerStatus, linkInstitutionWallet, type IssuerStatus } from "@/lib/api";
import { connectWallet, hasInjectedWallet, WalletError } from "@/lib/wallet";

const LINKED_WALLET_KEY_PREFIX = "credential-ecosystem-linked-wallet";

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-5)}`;
}

function userMessage(error: unknown) {
  if (error instanceof WalletError) return error.message;
  if (error instanceof Error && error.message.includes("already linked")) return "This wallet is already linked to another institution.";
  return error instanceof Error ? error.message : "The wallet operation could not be completed.";
}

export function InstitutionWalletPanel() {
  const { user } = useAuth();
  const linkedWalletKey = `${LINKED_WALLET_KEY_PREFIX}-${user?.id ?? "unknown"}`;
  const [connectedAddress, setConnectedAddress] = useState("");
  const [linkedAddress, setLinkedAddress] = useState("");
  const [status, setStatus] = useState<IssuerStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function refreshStatus() {
    setError("");
    try {
      const nextStatus = await getInstitutionIssuerStatus();
      setStatus(nextStatus);
      const storedWallet = window.localStorage.getItem(linkedWalletKey) ?? "";
      setLinkedAddress(storedWallet);
    } catch (statusError) {
      setError(userMessage(statusError));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // The initial status must be loaded after the client has access to localStorage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshStatus();
    // refreshStatus intentionally remains stable for this mount-time request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedWalletKey]);

  async function handleConnect() {
    setError(""); setMessage(""); setIsConnecting(true);
    try {
      const address = await connectWallet();
      setConnectedAddress(address);
      setMessage("Wallet connected. Link it to your institution account to continue.");
    } catch (connectionError) {
      setError(userMessage(connectionError));
    } finally { setIsConnecting(false); }
  }

  async function handleLink() {
    if (!connectedAddress) return;
    setError(""); setMessage(""); setIsLinking(true);
    try {
      const profile = await linkInstitutionWallet(connectedAddress);
      const address = profile.walletAddress ?? connectedAddress;
      window.localStorage.setItem(linkedWalletKey, address);
      setLinkedAddress(address);
      setMessage("Wallet linked to your institution account successfully.");
      await refreshStatus();
    } catch (linkError) {
      setError(userMessage(linkError));
    } finally { setIsLinking(false); }
  }

  const isLinkedToConnectedWallet = Boolean(linkedAddress && connectedAddress && linkedAddress.toLowerCase() === connectedAddress.toLowerCase());
  const hasKnownLinkedWallet = Boolean(linkedAddress);

  return <section className="mt-8 space-y-6 border-t border-slate-200 pt-8">
    <div>
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">Blockchain access</p>
      <h2 className="mt-2 text-2xl font-semibold text-slate-950">Institution wallet</h2>
      <p className="mt-2 text-slate-600">Connect a Polygon Amoy wallet before requesting issuer approval.</p>
    </div>
    {!hasInjectedWallet() ? <p className="rounded-md bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">MetaMask was not detected. <a className="font-semibold underline" href="https://metamask.io/download/" rel="noreferrer" target="_blank">Install MetaMask</a> to connect an institution wallet.</p> : <div className="space-y-4">
      {connectedAddress ? <p className="rounded-md bg-slate-50 px-4 py-3 text-sm text-slate-700">Connected wallet: <span className="font-semibold">{shortenAddress(connectedAddress)}</span></p> : <button className="button-primary sm:w-auto" disabled={isConnecting} onClick={handleConnect} type="button">{isConnecting ? "Connecting..." : "Connect Wallet"}</button>}
      {connectedAddress && !isLinkedToConnectedWallet && !status?.hasWallet && <button className="button-primary sm:w-auto" disabled={isLinking} onClick={handleLink} type="button">{isLinking ? "Linking wallet..." : "Link this wallet to my account"}</button>}
      {isLinkedToConnectedWallet && <p className="rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Wallet linked: <span className="font-semibold">{shortenAddress(linkedAddress)}</span></p>}
      {status?.hasWallet && !hasKnownLinkedWallet && <p className="rounded-md bg-slate-50 px-4 py-3 text-sm text-slate-600">A wallet is already linked to this account. The current address is not included in the issuer-status response.</p>}
    </div>}
    {message && <p className="rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</p>}
    {error && <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
    <div className="rounded-md bg-slate-50 p-5">
      <h3 className="font-semibold text-slate-950">Issuer status</h3>
      {isLoading ? <p className="mt-2 text-sm text-slate-600">Checking issuer status...</p> : !status?.hasWallet ? <p className="mt-2 text-sm text-slate-600">Connect and link a wallet to begin.</p> : status.isIssuer ? <p className="mt-2 text-sm font-semibold text-emerald-700">You&apos;re approved to issue certificates.</p> : <p className="mt-2 text-sm text-amber-700">Wallet linked. Waiting for platform approval before you can issue certificates.</p>}
    </div>
  </section>;
}