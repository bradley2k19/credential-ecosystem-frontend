const API_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");

export interface InstitutionRegistrationData {
  email: string;
  password: string;
  name: string;
  registrationNumber: string;
  address: string;
  contactEmail: string;
}

export interface EmployerRegistrationData {
  email: string;
  password: string;
  companyName: string;
  registrationNumber: string;
  industry: string;
  contactEmail: string;
}

export interface LoginResponse {
  token?: string;
  accessToken?: string;
  access_token?: string;
  user?: { id?: string; email?: string; role?: string };
  data?: {
    token?: string;
    accessToken?: string;
    access_token?: string;
    user?: { id?: string; email?: string; role?: string };
    id?: string;
    email?: string;
    role?: string;
  };
  id?: string;
  email?: string;
  role?: string;
  [key: string]: unknown;
}

async function request<T>(path: string, options: RequestInit, requiresAuth = false, acceptedStatuses: number[] = []): Promise<T> {
  if (!API_URL) throw new Error("The API URL is not configured.");

  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (requiresAuth && typeof window !== "undefined") {
    const token = window.localStorage.getItem("credential-ecosystem-token");
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });
  const body = await response.json().catch(() => null);

  if (!response.ok && !acceptedStatuses.includes(response.status)) {
    const errorMessage =
      (body && typeof body.message === "string" && body.message) ||
      (body && Array.isArray(body.message) && body.message.join(" ")) ||
      (body && typeof body.error === "string" && body.error) ||
      "Something went wrong. Please try again.";
    throw new ApiError(errorMessage, response.status);
  }
  return body as T;
}

export function registerInstitution(data: InstitutionRegistrationData) {
  return request<unknown>("/api/auth/register/institution", { method: "POST", body: JSON.stringify(data) });
}

export function registerEmployer(data: EmployerRegistrationData) {
  return request<unknown>("/api/auth/register/employer", { method: "POST", body: JSON.stringify(data) });
}

export function login(email: string, password: string) {
  return request<LoginResponse>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
}

export interface InstitutionProfile {
  id: string;
  name: string;
  walletAddress: string | null;
  isVerified: boolean;
  [key: string]: unknown;
}

export interface IssuerStatus {
  hasWallet: boolean;
  isIssuer?: boolean;
  // Checksummed linked wallet, or null when none is linked. The single source of truth for the linked address.
  walletAddress?: string | null;
}

export interface CreateStudentData {
  fullName: string;
  studentNumber: string;
  dateOfBirth?: string;
  programName: string;
  enrollmentYear: number;
  email: string;
}

export interface StudentRecord {
  id: string;
  fullName: string;
  studentNumber: string;
  programName: string;
  enrollmentYear: number;
  user: { email: string };
}

export interface CreateStudentResponse {
  id: string;
  fullName: string;
  studentNumber: string;
  email: string;
  temporaryPassword: string;
}

export interface StudentListResponse {
  students: StudentRecord[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface CreateCertificateData {
  studentId: string;
  certificateType: string;
  programName: string;
  classification?: string;
  issueDate: string;
  graduationDate?: string;
}

export interface CertificateRecord {
  id: string;
  certificateUid: string;
  studentId: string;
  certificateType: string;
  programName: string;
  classification: string | null;
  issueDate: string;
  graduationDate: string | null;
  certificateHash: string;
  status: "ACTIVE" | "REVOKED" | string;
  revokedReason?: string | null;
  student: { fullName: string; studentNumber: string };
  // Only included by the list endpoint: the confirmed (or latest) transaction of each type.
  onChain?: { issue: OnChainTransactionSummary | null; revoke: OnChainTransactionSummary | null };
}

export type BlockchainTxType = "ISSUE" | "REVOKE";

export interface OnChainTransactionSummary {
  txHash: string;
  status: "PENDING" | "CONFIRMED" | "FAILED" | string;
  submittedAt: string;
}

export interface CertificateListResponse {
  certificates: CertificateRecord[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface BlockchainTransactionRecord {
  txType: "ISSUE" | "REVOKE" | string;
  txHash: string;
  status: "PENDING" | "CONFIRMED" | "FAILED" | string;
  blockNumber?: number | null;
}

export interface BlockchainStatusResponse {
  certificateId: string;
  certificateUid: string;
  transactions: BlockchainTransactionRecord[];
}

export type VerificationResult = "valid" | "revoked" | "not_found" | "tampered" | "pending-chain";

export interface CertificateVerificationResult {
  result: VerificationResult;
  message?: string;
  certificate?: {
    certificateUid: string;
    studentName: string;
    studentNumber: string;
    certificateType: string;
    programName: string;
    classification: string | null;
    issueDate: string;
    institutionName: string;
  };
  revokedReason?: string;
}

export interface EmployerVerificationRecord {
  id: string;
  certificateUidQueried: string;
  method: "QR" | "MANUAL_ID" | string;
  result: "VALID" | "REVOKED" | "NOT_FOUND" | "TAMPERED" | "PENDING_CHAIN" | string;
  verifiedAt: string;
  certificate: {
    certificateUid: string;
    certificateType: string;
    programName: string;
  } | null;
}

export interface EmployerVerificationHistoryResponse {
  verifications: EmployerVerificationRecord[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

export function linkInstitutionWallet(walletAddress: string) {
  return request<InstitutionProfile>("/api/institutions/wallet", {
    method: "PUT",
    body: JSON.stringify({ walletAddress }),
  }, true);
}

export function getInstitutionIssuerStatus() {
  return request<IssuerStatus>("/api/institutions/me/issuer-status", { method: "GET" }, true);
}

export function createInstitutionStudent(data: CreateStudentData) {
  return request<CreateStudentResponse>("/api/institutions/students", {
    method: "POST",
    body: JSON.stringify(data),
  }, true);
}

export function getInstitutionStudents() {
  return request<StudentListResponse>("/api/institutions/students", { method: "GET" }, true);
}

export function createInstitutionCertificate(data: CreateCertificateData) {
  return request<CertificateRecord>("/api/institutions/certificates", {
    method: "POST",
    body: JSON.stringify(data),
  }, true);
}

export function getInstitutionCertificates() {
  return request<CertificateListResponse>("/api/institutions/certificates?limit=100", { method: "GET" }, true);
}

export function revokeInstitutionCertificate(certificateId: string, revokedReason: string) {
  return request<CertificateRecord>(`/api/institutions/certificates/${encodeURIComponent(certificateId)}/revoke`, {
    method: "PATCH",
    body: JSON.stringify({ revokedReason }),
  }, true);
}

export function recordInstitutionCertificateTransaction(certificateId: string, txType: BlockchainTxType, txHash: string) {
  return request<BlockchainTransactionRecord>(`/api/institutions/certificates/${encodeURIComponent(certificateId)}/blockchain-record`, {
    method: "POST",
    body: JSON.stringify({ txType, txHash }),
  }, true);
}

export function getInstitutionCertificateBlockchainStatus(certificateId: string) {
  return request<BlockchainStatusResponse>(`/api/institutions/certificates/${encodeURIComponent(certificateId)}/blockchain-status`, {
    method: "GET",
  }, true);
}

export function verifyCertificate(certificateUid: string) {
  return request<CertificateVerificationResult>(
    `/api/verify/${encodeURIComponent(certificateUid)}?method=manual_id`,
    { method: "GET" },
    true,
    [404],
  );
}

export function getEmployerVerificationHistory(page = 1, limit = 20) {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  return request<EmployerVerificationHistoryResponse>(`/api/employers/verifications?${query}`, { method: "GET" }, true);
}