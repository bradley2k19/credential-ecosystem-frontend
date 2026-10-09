import { BrowserProvider, getAddress, type JsonRpcSigner } from "ethers";

const AMOY_CHAIN_ID = 80002;
const AMOY_CHAIN_ID_HEX = "0x13882";

interface EthereumProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on(event: "accountsChanged", listener: (accounts: unknown) => void): void;
  removeListener(event: "accountsChanged", listener: (accounts: unknown) => void): void;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export class WalletError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WalletError";
  }
}

function getEthereumProvider() {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new WalletError("No wallet was detected. Install MetaMask to connect a wallet.");
  }
  return window.ethereum;
}

async function ensureAmoyNetwork(provider: EthereumProvider) {
  const chainId = await provider.request({ method: "eth_chainId" });
  if (Number.parseInt(String(chainId), 16) === AMOY_CHAIN_ID) return;

  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: AMOY_CHAIN_ID_HEX }] });
  } catch (error) {
    const errorCode = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
    if (errorCode !== 4902) {
      throw new WalletError("Please switch MetaMask to the Polygon Amoy network to continue.");
    }

    await provider.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: AMOY_CHAIN_ID_HEX,
        chainName: "Polygon Amoy Testnet",
        nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
        rpcUrls: ["https://rpc-amoy.polygon.technology"],
        blockExplorerUrls: ["https://amoy.polygonscan.com"],
      }],
    });
  }
}

/** Compares addresses after checksum normalisation, so letter case never causes a false mismatch. */
export function isSameAddress(a: string | null | undefined, b: string | null | undefined) {
  if (!a || !b) return false;
  try {
    return getAddress(a) === getAddress(b);
  } catch {
    return false;
  }
}

export function shortenAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function hasInjectedWallet() {
  return typeof window !== "undefined" && Boolean(window.ethereum);
}

export function subscribeToAccountsChanged(listener: (address: string) => void) {
  if (!hasInjectedWallet()) return () => {};

  const provider = getEthereumProvider();
  const handleAccountsChanged = (accounts: unknown) => {
    const address = Array.isArray(accounts) && typeof accounts[0] === "string" ? accounts[0] : "";
    listener(address);
  };

  provider.on("accountsChanged", handleAccountsChanged);
  return () => provider.removeListener("accountsChanged", handleAccountsChanged);
}

export async function connectWallet() {
  const provider = getEthereumProvider();
  await ensureAmoyNetwork(provider);
  const accounts = await provider.request({ method: "eth_requestAccounts" }) as string[];
  const address = accounts[0];
  if (!address) throw new WalletError("No wallet account was selected.");
  return address;
}

export function getBrowserProvider() {
  return new BrowserProvider(getEthereumProvider());
}

export async function getWalletSigner(): Promise<JsonRpcSigner> {
  // Switch network before creating the ethers provider; a provider created on another chain throws "network changed".
  await ensureAmoyNetwork(getEthereumProvider());
  return getBrowserProvider().getSigner();
}