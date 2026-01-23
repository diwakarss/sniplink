import type { LoginResponse, ApiError } from '@/types';

// Token stored in module scope (memory, not localStorage)
// This is intentional for XSS protection - see AUTH-02
let authToken: string | null = null;

export function setToken(token: string | null): void {
  authToken = token;
}

export function getToken(): string | null {
  return authToken;
}

export function clearToken(): void {
  authToken = null;
}

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // Add auth header if token exists
  if (authToken) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${authToken}`;
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error((data as ApiError).error || 'Request failed');
  }

  return data as T;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const response = await apiRequest<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  // Store token in memory
  setToken(response.token);

  return response;
}

export function logout(): void {
  clearToken();
}
