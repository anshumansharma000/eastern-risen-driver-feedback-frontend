import { apiRequest, getData } from "./api.ts";
import type {
  AdminDriver,
  AdminProfile,
  AdminResetDriverPasswordRequest,
  ChangePasswordRequest,
  DriverProfile,
  UpdateAdminProfileRequest,
  UpdateDriverProfileRequest,
} from "./contracts.ts";

export type ProfileRole = "admin" | "driver";

export const accountPaths = {
  profile: (role: ProfileRole) => `/api/v1/${role}/profile`,
  changePassword: (role: ProfileRole) => `/api/v1/${role}/profile/change-password`,
  driverDetail: (driverId: string) => `/api/v1/admin/drivers/${encodeURIComponent(driverId)}`,
  adminDriverReset: (driverId: string) => `/api/v1/admin/drivers/${encodeURIComponent(driverId)}/password-reset`,
} as const;

export function getAdminProfile() {
  return getData<AdminProfile>(accountPaths.profile("admin"));
}

export function updateAdminProfile(body: UpdateAdminProfileRequest) {
  return getData<AdminProfile>(accountPaths.profile("admin"), { method: "PATCH", body: JSON.stringify(body) });
}

export function getDriverProfile() {
  return getData<DriverProfile>(accountPaths.profile("driver"));
}

export function updateDriverProfile(body: UpdateDriverProfileRequest) {
  return getData<DriverProfile>(accountPaths.profile("driver"), { method: "PATCH", body: JSON.stringify(body) });
}

export function changePassword(role: ProfileRole, body: ChangePasswordRequest) {
  return apiRequest<void>(accountPaths.changePassword(role), { method: "POST", body: JSON.stringify(body) });
}

export function getAdminDriver(driverId: string) {
  return getData<AdminDriver>(accountPaths.driverDetail(driverId));
}

export function resetAdminDriverPassword(driverId: string, body: AdminResetDriverPasswordRequest) {
  return apiRequest<void>(accountPaths.adminDriverReset(driverId), { method: "POST", body: JSON.stringify(body) });
}

export function changedProfileFields<T extends Record<string, unknown>>(original: T, draft: T, fields: readonly (keyof T)[]) {
  return Object.fromEntries(fields.filter((field) => draft[field] !== original[field]).map((field) => [field, draft[field]])) as Partial<T>;
}

export function passwordValidation(newPassword: string, confirmation: string) {
  if (newPassword.length < 12 || newPassword.length > 128) return "Use between 12 and 128 characters.";
  if (newPassword !== confirmation) return "The new passwords do not match.";
  return null;
}

export function clearPrivateClientState() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("private-session-cleared"));
}
