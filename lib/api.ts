import type { DataResponse, PaginatedResponse } from "./contracts.ts";
import { parsePaginatedResponse } from "./pagination.ts";
import { canRetry } from "./retry-policy.ts";

export type ApiErrorKind = "transport" | "validation" | "authentication" | "authorization" | "not-found" | "conflict" | "rate-limit" | "server" | "protocol";
export class ApiError extends Error {
  status: number;
  code: string;
  requestId?: string;
  details?: unknown;
  kind: ApiErrorKind;
  constructor(status: number, code: string, message: string, requestId?: string, details?: unknown, kind: ApiErrorKind = "protocol") {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.details = details;
    this.kind = kind;
  }
}
const kindFor = (status: number): ApiErrorKind => status === 400 ? "validation" : status === 401 ? "authentication" : status === 403 ? "authorization" : status === 404 ? "not-found" : status === 409 ? "conflict" : status === 429 ? "rate-limit" : status >= 500 ? "server" : "protocol";
export const isRetryable = (error: unknown) => error instanceof ApiError && canRetry(error.status, error.kind);

const apiBase = () => (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080").replace(/\/$/, "");
let redirectingForAuthentication = false;
function redirectExpiredSession(path: string, status: number, passengerToken?: string) {
  if (status !== 401 || passengerToken || typeof window === "undefined" || redirectingForAuthentication) return;
  if (/\/api\/v1\/auth\/(?:admin|driver)\/login$/.test(path)) return;
  const role = window.location.pathname.startsWith("/admin") ? "admin" : window.location.pathname.startsWith("/driver") ? "driver" : null;
  if (!role || window.location.pathname === `/${role}/login`) return;
  redirectingForAuthentication = true;
  window.location.replace(`/${role}/login?reason=session-expired`);
}
export async function apiRequest<T>(path: string, init: RequestInit & { passengerToken?: string; timeoutMs?: number } = {}): Promise<T> {
  const { passengerToken, timeoutMs, ...requestInit } = init;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs ?? 12000);
  const headers = new Headers(init.headers);
  if (init.body) headers.set("content-type", "application/json");
  if (passengerToken) headers.set("authorization", `Bearer ${passengerToken}`);
  try {
    const response = await fetch(`${apiBase()}${path}`, { ...requestInit, headers, credentials: passengerToken ? "omit" : "include", signal: init.signal ?? controller.signal });
    if (response.status === 204) return undefined as T;
    const payload: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const envelope = payload as { error?: { code?: string; message?: string; details?: unknown; requestId?: string } } | undefined;
      redirectExpiredSession(path, response.status, passengerToken);
      throw new ApiError(response.status, envelope?.error?.code || "UNKNOWN_API_ERROR", envelope?.error?.message || "The service could not complete this request.", envelope?.error?.requestId || response.headers.get("x-request-id") || undefined, envelope?.error?.details, kindFor(response.status));
    }
    return payload as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(0, "NETWORK_UNAVAILABLE", "The service could not be reached.", undefined, undefined, "transport");
  } finally { clearTimeout(timeout); }
}
export async function getData<T>(path: string, init?: RequestInit & { passengerToken?: string }) { return (await apiRequest<DataResponse<T>>(path, init)).data; }
export async function getPaginated<T>(path: string, init?: RequestInit & { passengerToken?: string }): Promise<PaginatedResponse<T>> {
  return parsePaginatedResponse<T>(await apiRequest<unknown>(path, init));
}

const friendly: Record<string, string> = {
  AUTHENTICATION_FAILED: "Those details did not match an active account.", AUTHENTICATION_REQUIRED: "Your session has ended. Please sign in again.",
  FEEDBACK_HANDOFF_INVALID: "This passenger handoff has expired or is no longer valid. Please return the device to your driver.",
  BOOKING_REFERENCE_MISMATCH: "The booking reference does not match this trip.", FEEDBACK_ANSWERS_INVALID: "One or more answers need your attention.",
  RATE_LIMIT_EXCEEDED: "Too many attempts. Please wait a moment and try again.", NETWORK_UNAVAILABLE: "We cannot reach the service right now.",
  TRIP_CANNOT_BE_SCHEDULED_IN_PAST: "The trip must be scheduled in the future.",
  INVALID_TRIP_SCHEDULE: "The trip end time must be after the start time.",
  TRIP_LOCATIONS_MUST_DIFFER: "Pickup and destination must be different.",
  TRIP_BOOKING_REFERENCE_ALREADY_EXISTS: "This booking reference is already in use.",
  DRIVER_NOT_AVAILABLE_FOR_ASSIGNMENT: "The selected driver is currently unavailable for assignment.",
  DRIVER_SCHEDULE_CONFLICT: "The selected driver already has another trip during this time.",
  VEHICLE_SCHEDULE_CONFLICT: "The selected vehicle already has another trip during this time.",
  DRIVER_ON_LEAVE: "The selected driver is on leave during this time.",
  TRIP_OUTSIDE_DRIVER_SHIFT: "This trip falls outside the selected driver’s configured shift.",
  DRIVER_DAILY_DUTY_LIMIT_EXCEEDED: "This trip would exceed the driver’s daily duty limit.",
  ACCOUNT_EMAIL_ALREADY_EXISTS: "That email address is already used by another account.",
  CURRENT_PASSWORD_INVALID: "The current password is incorrect.",
  PASSWORD_REUSE_NOT_ALLOWED: "Choose a password you have not used before.",
  PROFILE_NOT_FOUND: "This profile is no longer available.",
  DRIVER_NOT_FOUND: "This driver is no longer available.",
  REQUEST_VALIDATION_FAILED: "One or more fields need your attention.",
  ADMIN_ACCESS_REQUIRED: "Administrator access is required.",
  DRIVER_ACCESS_REQUIRED: "Driver access is required.",
  INTERNAL_SERVER_ERROR: "The service encountered a problem. Try again later.",
};
export function errorMessage(error: unknown) { return error instanceof ApiError ? (friendly[error.code] || error.message) : "Something unexpected happened."; }
