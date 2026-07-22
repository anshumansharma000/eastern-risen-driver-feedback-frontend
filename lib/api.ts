import type { DataResponse } from "./contracts";
import { canRetry } from "./retry-policy";

export type ApiErrorKind = "transport" | "validation" | "authentication" | "authorization" | "not-found" | "conflict" | "rate-limit" | "server" | "protocol";
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public requestId?: string, public details?: unknown, public kind: ApiErrorKind = "protocol") { super(message); this.name = "ApiError"; }
}
const kindFor = (status: number): ApiErrorKind => status === 400 ? "validation" : status === 401 ? "authentication" : status === 403 ? "authorization" : status === 404 ? "not-found" : status === 409 ? "conflict" : status === 429 ? "rate-limit" : status >= 500 ? "server" : "protocol";
export const isRetryable = (error: unknown) => error instanceof ApiError && canRetry(error.status, error.kind);

const apiBase = () => (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
export async function apiRequest<T>(path: string, init: RequestInit & { passengerToken?: string; timeoutMs?: number } = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init.timeoutMs ?? 12000);
  const headers = new Headers(init.headers);
  if (init.body) headers.set("content-type", "application/json");
  if (init.passengerToken) headers.set("authorization", `Bearer ${init.passengerToken}`);
  try {
    const response = await fetch(`${apiBase()}${path}`, { ...init, headers, credentials: init.passengerToken ? "omit" : "include", signal: init.signal ?? controller.signal });
    if (response.status === 204) return undefined as T;
    const payload: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const envelope = payload as { error?: { code?: string; message?: string; details?: unknown; requestId?: string } } | undefined;
      throw new ApiError(response.status, envelope?.error?.code || "UNKNOWN_API_ERROR", envelope?.error?.message || "The service could not complete this request.", envelope?.error?.requestId || response.headers.get("x-request-id") || undefined, envelope?.error?.details, kindFor(response.status));
    }
    return payload as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(0, "NETWORK_UNAVAILABLE", "The service could not be reached.", undefined, undefined, "transport");
  } finally { clearTimeout(timeout); }
}
export async function getData<T>(path: string, init?: RequestInit & { passengerToken?: string }) { return (await apiRequest<DataResponse<T>>(path, init)).data; }

const friendly: Record<string, string> = {
  AUTHENTICATION_FAILED: "Those details did not match an active account.", AUTHENTICATION_REQUIRED: "Your session has ended. Please sign in again.",
  FEEDBACK_HANDOFF_INVALID: "This passenger handoff has expired or is no longer valid. Please return the device to your driver.",
  BOOKING_REFERENCE_MISMATCH: "The booking reference does not match this trip.", FEEDBACK_ANSWERS_INVALID: "One or more answers need your attention.",
  RATE_LIMIT_EXCEEDED: "Too many attempts. Please wait a moment and try again.", NETWORK_UNAVAILABLE: "We cannot reach the service right now.",
};
export function errorMessage(error: unknown) { return error instanceof ApiError ? (friendly[error.code] || error.message) : "Something unexpected happened."; }
