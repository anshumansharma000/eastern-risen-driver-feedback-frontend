export type E164Phone = `+${number}`;

export const E164_PATTERN = /^\+[1-9]\d{7,14}$/;
export const PHONE_ERROR = "Enter a valid phone number including country code.";
export const PHONE_HELP = "Choose a country, then enter the national number.";

export type PhoneCountry = { iso: string; name: string; callingCode: string };

export const PHONE_COUNTRIES: readonly PhoneCountry[] = [
  { iso: "IN", name: "India", callingCode: "91" },
  { iso: "US", name: "United States", callingCode: "1" },
  { iso: "CA", name: "Canada", callingCode: "1" },
  { iso: "GB", name: "United Kingdom", callingCode: "44" },
  { iso: "AE", name: "United Arab Emirates", callingCode: "971" },
  { iso: "AU", name: "Australia", callingCode: "61" },
  { iso: "BD", name: "Bangladesh", callingCode: "880" },
  { iso: "BR", name: "Brazil", callingCode: "55" },
  { iso: "CH", name: "Switzerland", callingCode: "41" },
  { iso: "CN", name: "China", callingCode: "86" },
  { iso: "DE", name: "Germany", callingCode: "49" },
  { iso: "ES", name: "Spain", callingCode: "34" },
  { iso: "FR", name: "France", callingCode: "33" },
  { iso: "ID", name: "Indonesia", callingCode: "62" },
  { iso: "IE", name: "Ireland", callingCode: "353" },
  { iso: "IT", name: "Italy", callingCode: "39" },
  { iso: "JP", name: "Japan", callingCode: "81" },
  { iso: "KE", name: "Kenya", callingCode: "254" },
  { iso: "LK", name: "Sri Lanka", callingCode: "94" },
  { iso: "MX", name: "Mexico", callingCode: "52" },
  { iso: "MY", name: "Malaysia", callingCode: "60" },
  { iso: "NG", name: "Nigeria", callingCode: "234" },
  { iso: "NP", name: "Nepal", callingCode: "977" },
  { iso: "NL", name: "Netherlands", callingCode: "31" },
  { iso: "NZ", name: "New Zealand", callingCode: "64" },
  { iso: "PH", name: "Philippines", callingCode: "63" },
  { iso: "PK", name: "Pakistan", callingCode: "92" },
  { iso: "QA", name: "Qatar", callingCode: "974" },
  { iso: "RU", name: "Russia", callingCode: "7" },
  { iso: "SA", name: "Saudi Arabia", callingCode: "966" },
  { iso: "SE", name: "Sweden", callingCode: "46" },
  { iso: "SG", name: "Singapore", callingCode: "65" },
  { iso: "TH", name: "Thailand", callingCode: "66" },
  { iso: "TR", name: "Türkiye", callingCode: "90" },
  { iso: "ZA", name: "South Africa", callingCode: "27" },
] as const;

export function normalizeNationalNumber(value: string): string {
  return value.replace(/\D/g, "");
}

export function buildE164(callingCode: string, nationalNumber: string): E164Phone | "" {
  const code = normalizeNationalNumber(callingCode).replace(/^0+/, "");
  const number = normalizeNationalNumber(nationalNumber);
  return number ? `+${code}${number}` as E164Phone : "";
}

export function phoneError(value: string | null | undefined, optional = false): string | null {
  if (optional && !value) return null;
  return E164_PATTERN.test(value || "") ? null : PHONE_ERROR;
}

export type ParsedPhone = { country: PhoneCountry; nationalNumber: string; canonical: string; invalidLegacy: boolean };

export function parsePhoneValue(value: string | null | undefined, defaultIso = "IN"): ParsedPhone {
  const fallback = PHONE_COUNTRIES.find((country) => country.iso === defaultIso) || PHONE_COUNTRIES[0];
  const raw = (value || "").trim();
  if (!raw) return { country: fallback, nationalNumber: "", canonical: "", invalidLegacy: false };

  if (raw.startsWith("+")) {
    const normalized = `+${normalizeNationalNumber(raw)}`;
    if (E164_PATTERN.test(normalized)) {
      const digits = normalized.slice(1);
      const country = [...PHONE_COUNTRIES]
        .sort((left, right) => right.callingCode.length - left.callingCode.length)
        .find((candidate) => digits.startsWith(candidate.callingCode));
      if (country) return { country, nationalNumber: digits.slice(country.callingCode.length), canonical: normalized, invalidLegacy: false };
    }
  }

  return { country: fallback, nationalNumber: raw, canonical: raw, invalidLegacy: true };
}

export function canonicalPhoneFromForm(data: FormData, name: string, optional = false): E164Phone | null | string {
  const value = String(data.get(name) || "");
  return optional && !value ? null : value;
}

export function optionalPhoneValue(value: FormDataEntryValue | string | null | undefined): E164Phone | null {
  const phone = String(value || "");
  return phone ? phone as E164Phone : null;
}
