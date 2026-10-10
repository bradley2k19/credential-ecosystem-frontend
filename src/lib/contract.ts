import { Contract, parseUnits, type Provider, type Signer } from "ethers";

const certificateRegistryAbi = [
  "function issueCertificate(string certificateUid, bytes32 certificateHash)",
  "function revokeCertificate(string certificateUid)",
  "function getCertificate(string certificateUid) view returns (bytes32 certificateHash, address issuer, bool revoked, uint256 issuedAt)",
  "event CertificateIssued(string indexed certificateUid, address indexed issuer, bytes32 certificateHash, uint256 timestamp)",
  "event CertificateRevoked(string indexed certificateUid, address indexed revokedBy, uint256 timestamp)",
];

// Polygon Amoy rejects transactions whose priority fee (gas tip cap) is below 25 gwei, but wallets and
// RPC fee estimates often suggest about 1.5 gwei. 30 gwei keeps a safe margin above that minimum.
const MIN_PRIORITY_FEE_PER_GAS = parseUnits("30", "gwei");

function maxBigInt(a: bigint, b: bigint) {
  return a > b ? a : b;
}

export function getCertificateRegistryContract(signer: Signer) {
  const address = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
  if (!address) throw new Error("The certificate contract address is not configured.");
  return new Contract(address, certificateRegistryAbi, signer);
}

/** Fee overrides for every write transaction, so the network's minimum priority fee is always met. */
export async function getFeeOverrides(provider: Provider) {
  const feeData = await provider.getFeeData();
  const maxPriorityFeePerGas = maxBigInt(feeData.maxPriorityFeePerGas ?? MIN_PRIORITY_FEE_PER_GAS, MIN_PRIORITY_FEE_PER_GAS);
  const doubledPriorityFee = maxPriorityFeePerGas * BigInt(2);
  const maxFeePerGas = maxBigInt(feeData.maxFeePerGas ?? doubledPriorityFee, doubledPriorityFee);
  return { maxPriorityFeePerGas, maxFeePerGas };
}
