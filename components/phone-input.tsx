"use client";

import { useState } from "react";
import { buildE164, parsePhoneValue, PHONE_COUNTRIES, PHONE_ERROR, PHONE_HELP } from "@/lib/phone";

type PhoneInputProps = {
  name: string;
  label: string;
  required?: boolean;
  defaultValue?: string | null;
  value?: string;
  error?: string;
  onValueChange?: (value: string) => void;
};

export function PhoneInput({ name, label, required = true, defaultValue, value, error, onValueChange }: PhoneInputProps) {
  const initial = parsePhoneValue(value ?? defaultValue);
  const [countryIso, setCountryIso] = useState(initial.country.iso);
  const [nationalNumber, setNationalNumber] = useState(initial.nationalNumber);
  const [submittedValue, setSubmittedValue] = useState(initial.canonical);
  const [invalidLegacy, setInvalidLegacy] = useState(initial.invalidLegacy);
  const country = PHONE_COUNTRIES.find((candidate) => candidate.iso === countryIso) || PHONE_COUNTRIES[0];
  const errorId = `${name}-error`;
  const helpId = `${name}-help`;
  const displayedError = error || (invalidLegacy ? PHONE_ERROR : undefined);

  function update(nextCountryIso: string, nextNational: string) {
    const nextCountry = PHONE_COUNTRIES.find((candidate) => candidate.iso === nextCountryIso) || PHONE_COUNTRIES[0];
    const digits = nextNational.replace(/\D/g, "");
    const canonical = buildE164(nextCountry.callingCode, digits);
    setCountryIso(nextCountry.iso);
    setNationalNumber(digits);
    setSubmittedValue(canonical);
    setInvalidLegacy(false);
    onValueChange?.(canonical);
  }

  return <div className="field phone-field">
    <label htmlFor={`${name}-national`}>{label}{!required && " (optional)"}</label>
    <div className="phone-input-row">
      <select className="select phone-country" name={`${name}Country`} aria-label={`${label} country`} value={country.iso} onChange={(event) => update(event.target.value, nationalNumber)}>
        {PHONE_COUNTRIES.map((option) => <option key={option.iso} value={option.iso}>{option.iso} (+{option.callingCode})</option>)}
      </select>
      <input className="input" id={`${name}-national`} type="tel" inputMode="tel" autoComplete="tel-national" required={required} value={nationalNumber} maxLength={32} aria-invalid={Boolean(displayedError)} aria-describedby={`${helpId}${displayedError ? ` ${errorId}` : ""}`} onChange={(event) => update(country.iso, event.target.value)} />
    </div>
    <input type="hidden" name={name} value={submittedValue} />
    <small id={helpId}>{PHONE_HELP}</small>
    {displayedError && <small className="field-error" id={errorId} role="alert">{displayedError}</small>}
  </div>;
}
