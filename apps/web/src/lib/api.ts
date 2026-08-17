'use client';

import type { AuthResponse, SessionUser } from './types';

/**
 * Tiny typed API client with token storage + one-shot refresh-and-retry.
 * Base URL is relative in production (same origin through Caddy) and can be
 * pointed at :4000 in development via NEXT_PUBLIC_API_URL.
 */
const API_BASE = `${process.env.NEXT_PUBLIC_API_URL ?? ''}/api/v1`;

const LS_ACCESS = 'bs.accessToken';
const LS_REFRESH = 'bs.refreshToken';
const LS_USER = 'bs.user';

export class ApiError extends Error {
  code: string;
  status: number;
  fieldErrors?: unknown;

  constructor(status: number, code: string, message: string, fieldErrors?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export function getSessionUser(): SessionUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LS_USER);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

export function storeSession(auth: AuthResponse) {
  localStorage.setItem(LS_ACCESS, auth.accessToken);
  localStorage.setItem(LS_REFRESH, auth.refreshToken);
  localStorage.setItem(LS_USER, JSON.stringify(auth.user));
}

export function clearSession() {
  localStorage.removeItem(LS_ACCESS);
  localStorage.removeItem(LS_REFRESH);
  localStorage.removeItem(LS_USER);
}

/** Хадгалсан session хэрэглэгчийн талбарыг шинэчилнэ (ж: нууц үг сольсны дараа). */
export function updateStoredUser(patch: Partial<SessionUser>) {
  const user = getSessionUser();
  if (!user) return;
  localStorage.setItem(LS_USER, JSON.stringify({ ...user, ...patch }));
}

async function rawRequest<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<T> {
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData) && init.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (res.status === 204) return undefined as T;

  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) {
    throw new ApiError(
      res.status,
      body?.code ?? 'HTTP_ERROR',
      body?.message_mn ?? body?.message_en ?? `Хүсэлт амжилтгүй (${res.status})`,
      body?.field_errors,
    );
  }
  return body as T;
}

let refreshing: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (!refreshing) {
    refreshing = (async () => {
      const refreshToken = localStorage.getItem(LS_REFRESH);
      if (!refreshToken) return false;
      try {
        const auth = await rawRequest<AuthResponse>('/auth/refresh', {
          method: 'POST',
          body: JSON.stringify({ refreshToken }),
        });
        storeSession(auth);
        return true;
      } catch {
        clearSession();
        return false;
      } finally {
        refreshing = null;
      }
    })();
  }
  return refreshing;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Authenticated request with automatic refresh-once-then-redirect.
 * Read-only requests (GET) additionally retry once on 5xx/network failure —
 * this rides out the brief API restart during a deploy instead of surfacing
 * a scary error for a 2-second blip.
 */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem(LS_ACCESS) : null;
  const isRead = !init.method || init.method.toUpperCase() === 'GET';
  try {
    return await rawRequest<T>(path, init, token);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401 && typeof window !== 'undefined') {
      const ok = await tryRefresh();
      if (ok) {
        return rawRequest<T>(path, init, localStorage.getItem(LS_ACCESS));
      }
      window.location.href = '/login';
      throw e;
    }
    const retryable = isRead && (!(e instanceof ApiError) || e.status >= 500);
    if (retryable && typeof window !== 'undefined') {
      await sleep(1500);
      return rawRequest<T>(path, init, localStorage.getItem(LS_ACCESS));
    }
    throw e;
  }
}

/** Unauthenticated request (public pay page, auth endpoints). */
export function apiPublic<T>(path: string, init: RequestInit = {}): Promise<T> {
  return rawRequest<T>(path, init);
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const auth = await rawRequest<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  storeSession(auth);
  return auth;
}

export async function registerAccount(input: {
  email: string;
  password: string;
  name: string;
  organizationName: string;
  phone?: string;
  regNo?: string;
}): Promise<AuthResponse> {
  const auth = await rawRequest<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  storeSession(auth);
  return auth;
}

export async function logout() {
  const refreshToken = localStorage.getItem(LS_REFRESH);
  clearSession();
  if (refreshToken) {
    await rawRequest('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) }).catch(() => undefined);
  }
}
