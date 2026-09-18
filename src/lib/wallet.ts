import { BrowserProvider, type JsonRpcSigner } from "ethers";

const AMOY_CHAIN_ID = 80002;
const AMOY_CHAIN_ID_HEX = "0x13882";

interface EthereumProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
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

export function hasInjectedWallet() {
  return typeof window !== "undefined" && Boolean(window.ethereum);
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
  const provider = getBrowserProvider();
  await ensureAmoyNetwork(getEthereumProvider());
  return provider.getSigner();
}