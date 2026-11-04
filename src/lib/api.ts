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

/** The stored token, only when the stored session belongs to an employer. Never throws. */
function getStoredEmployerToken() {
  if (typeof window === "undefined") return null;
  try {
    const user = JSON.parse(window.localStorage.getItem("credential-ecosystem-user") ?? "null") as { role?: string } | null;
    return user?.role === "employer" ? window.localStorage.getItem("credential-ecosystem-token") : null;
  } catch {
    return null;
  }
}

/**
 * Public verification. It needs no login: an employer's token is attached only so the check is
 * attributed to them, and any other (or missing) session sends no token at all.
 */
export function verifyCertificate(certificateUid: string, method: "qr" | "manual_id" = "manual_id") {
  const token = getStoredEmployerToken();
  return request<CertificateVerificationResult>(
    `/api/verify/${encodeURIComponent(certificateUid)}?method=${method}`,
    { method: "GET", headers: token ? { Authorization: `Bearer ${token}` } : undefined },
    false,
    [404],
  );
}

export interface StudentProfile {
  fullName: string;
  studentNumber: string;
  programName: string;
  enrollmentYear: number;
  email: string;
  institutionName: string;
}

export interface StudentCertificate {
  id: string;
  certificateUid: string;
  certificateType: string;
  programName: string;
  classification: string | null;
  issueDate: string;
  graduationDate: string | null;
  status: "ACTIVE" | "REVOKED" | string;
  revokedReason?: string | null;
  institutionName: string;
  onChain: { issue: OnChainTransactionSummary | null; revoke: OnChainTransactionSummary | null };
}

export interface StudentCertificateListResponse {
  certificates: StudentCertificate[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface StudentVerificationRecord {
  id: string;
  method: "QR" | "MANUAL_ID" | string;
  result: "VALID" | "REVOKED" | "TAMPERED" | "PENDING_CHAIN" | string;
  verifiedAt: string;
  certificate: { certificateUid: string; certificateType: string } | null;
  verifiedBy: string;
}

export interface StudentVerificationHistoryResponse {
  verifications: StudentVerificationRecord[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export function getStudentProfile() {
  return request<StudentProfile>("/api/students/me", { method: "GET" }, true);
}

export function getStudentCertificates() {
  return request<StudentCertificateListResponse>("/api/students/me/certificates?limit=100", { method: "GET" }, true);
}

export function getStudentCertificate(certificateId: string) {
  return request<StudentCertificate>(`/api/students/me/certificates/${encodeURIComponent(certificateId)}`, { method: "GET" }, true);
}

export function getStudentVerificationHistory(page = 1, limit = 20) {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  return request<StudentVerificationHistoryResponse>(`/api/students/me/verifications?${query}`, { method: "GET" }, true);
}

export function changePassword(currentPassword: string, newPassword: string) {
  return request<{ message: string }>("/api/auth/change-password", {
    method: "PATCH",
    body: JSON.stringify({ currentPassword, newPassword }),
  }, true);
}

export interface InstitutionVerificationRecord {
  id: string;
  verifiedAt: string;
  result: "VALID" | "REVOKED" | "TAMPERED" | "PENDING_CHAIN" | string;
  method: "QR" | "MANUAL_ID" | string;
  certificate: { certificateUid: string; certificateType: string; programName: string } | null;
  student: { fullName: string; studentNumber: string } | null;
  verifiedBy: string;
}

export interface InstitutionVerificationListResponse {
  verifications: InstitutionVerificationRecord[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

/** Dates are YYYY-MM-DD from a date input, interpreted as whole days in the browser's time zone. */
export interface InstitutionVerificationFilters {
  result?: string;
  from?: string;
  to?: string;
}

export function getInstitutionVerifications(page = 1, limit = 20, filters: InstitutionVerificationFilters = {}) {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (filters.result) query.set("result", filters.result);
  // Verification times are timestamps, so send local day boundaries rather than UTC dates.
  if (filters.from) query.set("from", new Date(`${filters.from}T00:00:00`).toISOString());
  if (filters.to) query.set("to", new Date(`${filters.to}T23:59:59.999`).toISOString());
  return request<InstitutionVerificationListResponse>(`/api/institutions/verifications?${query}`, { method: "GET" }, true);
}

export interface InstitutionReportSummary {
  certificates: {
    total: number;
    active: number;
    revoked: number;
    issueConfirmed: number;
    issuePending: number;
    issueMissingOrFailed: number;
  };
  verifications: {
    total: number;
    last30Days: number;
    byResult: Record<"VALID" | "REVOKED" | "TAMPERED" | "PENDING_CHAIN", number>;
  };
}

export function getInstitutionReportSummary() {
  return request<InstitutionReportSummary>("/api/institutions/reports/summary", { method: "GET" }, true);
}

/** Issue dates are stored as UTC calendar dates, so YYYY-MM-DD values are sent unchanged. */
export interface CertificateExportFilters {
  status?: "ACTIVE" | "REVOKED" | "";
  from?: string;
  to?: string;
}

/** Fetches the CSV export with the stored token. The endpoint needs the Authorization header, so a plain link can't be used. */
export async function downloadInstitutionCertificatesCsv(filters: CertificateExportFilters = {}) {
  if (!API_URL) throw new Error("The API URL is not configured.");

  const query = new URLSearchParams();
  if (filters.status) query.set("status", filters.status);
  if (filters.from) query.set("from", filters.from);
  if (filters.to) query.set("to", filters.to);

  const token = typeof window !== "undefined" ? window.localStorage.getItem("credential-ecosystem-token") : null;
  const response = await fetch(`${API_URL}/api/institutions/reports/certificates.csv?${query}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError((body && typeof body.error === "string" && body.error) || "The export could not be downloaded. Please try again.", response.status);
  }
  return response.blob();
}

export function getEmployerVerificationHistory(page = 1, limit = 20) {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  return request<EmployerVerificationHistoryResponse>(`/api/employers/verifications?${query}`, { method: "GET" }, true);
}

export interface AdminOverview {
  institutions: { total: number; verified: number; awaitingVerification: number };
  students: { total: number };
  certificates: { total: number; active: number; revoked: number };
  verifications: { total: number };
}

export interface AdminInstitution {
  id: string;
  name: string;
  registrationNumber: string;
  contactEmail: string | null;
  isVerified: boolean;
  walletAddress: string | null;
  createdAt: string;
  certificatesIssued: number;
  // Live on-chain role; null when there is no wallet or the chain could not be read.
  isIssuer: boolean | null;
}

export interface AdminInstitutionListResponse {
  institutions: AdminInstitution[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface AdminInstitutionFilters {
  verified?: "true" | "false" | "";
  search?: string;
}

/** A confirmed role change, or one submitted but not mined within the backend's wait (HTTP 202). */
export interface AdminRoleChangeResponse {
  institutionId: string;
  walletAddress: string;
  transactionHash: string;
  status: "CONFIRMED" | "PENDING";
  blockNumber?: number | null;
  message?: string;
}

export type AdminAuditAction = "INSTITUTION_VERIFIED" | "INSTITUTION_UNVERIFIED" | "ISSUER_GRANTED" | "ISSUER_REVOKED";

export interface AdminAuditLog {
  id: string;
  createdAt: string;
  adminEmail: string | null;
  action: AdminAuditAction | string;
  institution: { id: string | null; name: string | null };
  details: { transactionHash?: string | null; outcome?: string; failure?: string; [key: string]: unknown };
}

export interface AdminAuditLogListResponse {
  auditLogs: AdminAuditLog[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export function getAdminOverview() {
  return request<AdminOverview>("/api/admin/overview", { method: "GET" }, true);
}

export function getAdminInstitutions(page = 1, limit = 20, filters: AdminInstitutionFilters = {}) {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (filters.verified) query.set("verified", filters.verified);
  if (filters.search?.trim()) query.set("search", filters.search.trim());
  return request<AdminInstitutionListResponse>(`/api/admin/institutions?${query}`, { method: "GET" }, true);
}

export function setAdminInstitutionVerification(institutionId: string, isVerified: boolean) {
  return request<AdminInstitution>(`/api/admin/institutions/${encodeURIComponent(institutionId)}/verification`, {
    method: "PATCH",
    body: JSON.stringify({ isVerified }),
  }, true);
}

export function grantAdminInstitutionIssuer(institutionId: string) {
  return request<AdminRoleChangeResponse>(`/api/admin/institutions/${encodeURIComponent(institutionId)}/grant-issuer`, { method: "POST" }, true);
}

export function revokeAdminInstitutionIssuer(institutionId: string) {
  return request<AdminRoleChangeResponse>(`/api/admin/institutions/${encodeURIComponent(institutionId)}/revoke-issuer`, { method: "POST" }, true);
}

export function getAdminAuditLogs(page = 1, limit = 20, action = "") {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (action) query.set("action", action);
  return request<AdminAuditLogListResponse>(`/api/admin/audit-logs?${query}`, { method: "GET" }, true);
}