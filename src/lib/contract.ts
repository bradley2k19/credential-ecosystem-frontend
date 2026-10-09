import { Contract, type Signer } from "ethers";

const certificateRegistryAbi = [
  "function issueCertificate(string certificateUid, bytes32 certificateHash)",
  "function revokeCertificate(string certificateUid)",
  "function getCertificate(string certificateUid) view returns (bytes32 certificateHash, address issuer, bool revoked, uint256 issuedAt)",
  "event CertificateIssued(string indexed certificateUid, address indexed issuer, bytes32 certificateHash, uint256 timestamp)",
  "event CertificateRevoked(string indexed certificateUid, address indexed revokedBy, uint256 timestamp)",
];

export function getCertificateRegistryContract(signer: Signer) {
  const address = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
  if (!address) throw new Error("The certificate contract address is not configured.");
  return new Contract(address, certificateRegistryAbi, signer);
}
