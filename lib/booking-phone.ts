import { E164_PATTERN, PHONE_ERROR, PHONE_HELP, type E164Phone } from "./phone.ts";

export { E164_PATTERN };
export const E164_HELP = PHONE_HELP;
export const E164_ERROR = PHONE_ERROR;

export function canonicalPassengerPhone(value: FormDataEntryValue | string | null): E164Phone {
  return String(value || "").trim() as E164Phone;
}

export function passengerPhoneError(value: string): string | null {
  return E164_PATTERN.test(value) ? null : E164_ERROR;
}

function fieldPath(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join(".");
  return typeof value === "string"
    ? value.replace(/^\/+/, "").replaceAll("/", ".").replace(/^body\./, "")
    : "";
}

export function backendPassengerPhoneError(details: unknown): string | null {
  let result: string | null = null;
  const visit = (value: unknown) => {
    if (result || !value) return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (typeof value !== "object") return;
    const issue = value as Record<string, unknown>;
    const path = fieldPath(issue.instancePath ?? issue.path ?? issue.field ?? issue.dataPath);
    const message = typeof issue.message === "string" ? issue.message : typeof issue.error === "string" ? issue.error : null;
    if (path.endsWith("passengerPhone") && message) { result = message; return; }
    const direct = issue.passengerPhone;
    if (typeof direct === "string") { result = direct; return; }
    if (Array.isArray(direct) && typeof direct[0] === "string") { result = direct[0]; return; }
    for (const key of ["errors", "issues", "validation", "details"]) visit(issue[key]);
  };
  visit(details);
  return result;
}
