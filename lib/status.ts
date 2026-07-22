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
