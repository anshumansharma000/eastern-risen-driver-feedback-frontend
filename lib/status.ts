import type { LifecycleStatus, TripCreationSource, TripStatus } from "./contracts";

export const tripStatus: Record<TripStatus, { label: string; tone: string }> = {
  READY: { label: "Ready for feedback", tone: "success" },
  FEEDBACK_STARTED: { label: "Feedback started", tone: "warning" },
  SUBMITTED: { label: "Feedback received", tone: "neutral" },
  ARCHIVED: { label: "Archived", tone: "danger" },
};
export const tripSource: Record<TripCreationSource, string> = { ADMIN_ASSIGNED: "Assigned by admin", DRIVER_ENTERED: "Entered by driver" };
export const lifecycleStatus: Record<LifecycleStatus, { label: string; tone: string }> = {
  ACTIVE: { label: "Active", tone: "success" }, DEACTIVATED: { label: "Deactivated", tone: "warning" }, ARCHIVED: { label: "Archived", tone: "danger" },
};
export function formatIndiaDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
export function formatDateTime(value: string, timeZone = "Asia/Kolkata") {
  return new Intl.DateTimeFormat("en-IN", { timeZone, day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit", timeZoneName:"short" }).format(new Date(value));
}
export function formatTripRange(start: string | null | undefined, end: string | null | undefined, timeZone = "Asia/Kolkata") {
  const startDate = new Date(typeof start === "string" ? start : Number.NaN);
  const endDate = new Date(typeof end === "string" ? end : Number.NaN);
  if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || endDate < startDate) {
    return "Schedule unavailable";
  }

  const options: Intl.DateTimeFormatOptions = {
    timeZone,
    day:"2-digit",
    month:"short",
    year:"numeric",
    hour:"2-digit",
    minute:"2-digit",
    timeZoneName:"short",
  };
  try {
    return new Intl.DateTimeFormat("en-IN", options).formatRange(startDate, endDate);
  } catch {
    return new Intl.DateTimeFormat("en-IN", { ...options, timeZone:"Asia/Kolkata" }).formatRange(startDate, endDate);
  }
}
