export type DriverAssignmentSettings = {
  assignmentEnabled: boolean;
  shiftStartTime: string | null;
  shiftEndTime: string | null;
  timeZone: string;
  maxDailyDutyMinutes: number;
};

export function dutyMinutes(hours: FormDataEntryValue | null, minutes: FormDataEntryValue | null) {
  return Number(hours || 0) * 60 + Number(minutes || 0);
}

export function assignmentSettingsFromForm(data: FormData): DriverAssignmentSettings {
  return {
    assignmentEnabled: data.get("assignmentEnabled") === "on",
    shiftStartTime: String(data.get("shiftStartTime") || "") || null,
    shiftEndTime: String(data.get("shiftEndTime") || "") || null,
    timeZone: String(data.get("timeZone") || "").trim(),
    maxDailyDutyMinutes: dutyMinutes(data.get("dutyHours"), data.get("dutyMinutes")),
  };
}

export function validateAssignmentSettings(body: DriverAssignmentSettings) {
  if (!!body.shiftStartTime !== !!body.shiftEndTime) return "Enter both shift times, or clear both.";
  if (body.shiftStartTime && body.shiftStartTime === body.shiftEndTime) return "Shift start and end must be different. Overnight shifts are allowed.";
  if (!body.timeZone) return "Enter an IANA timezone.";
  try { new Intl.DateTimeFormat("en", { timeZone: body.timeZone }).format(); } catch { return "Enter a valid IANA timezone, such as Asia/Kolkata."; }
  if (!Number.isInteger(body.maxDailyDutyMinutes) || body.maxDailyDutyMinutes < 1 || body.maxDailyDutyMinutes > 1440) return "Maximum daily duty must be between 1 minute and 24 hours.";
  return null;
}

export function driverMutationFromForm(data: FormData, sourceType: "AGENCY" | "OUTSOURCED", includeAccountFields = false) {
  const common = {
    displayName: String(data.get("displayName") || "").trim(),
    driverCode: String(data.get("driverCode") || "").trim(),
    phone: String(data.get("phone") || "").trim() || null,
    sourceType,
    vendorId: sourceType === "OUTSOURCED" ? String(data.get("vendorId") || "") : null,
    ...assignmentSettingsFromForm(data),
  };
  const withEmail = { ...common, email: String(data.get("email") || "").trim() };
  return includeAccountFields ? { ...withEmail, password: String(data.get("password") || "") } : withEmail;
}
