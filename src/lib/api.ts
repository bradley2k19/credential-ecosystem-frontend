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
    throw new Error(errorMessage);
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