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

async function request<T>(path: string, options: RequestInit, requiresAuth = false): Promise<T> {
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

  if (!response.ok) {
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