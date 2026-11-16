"use client";

import { useState } from "react";
import { parsePhoneInput, PHONE_COUNTRIES, PHONE_ERROR, PHONE_HELP } from "@/lib/phone";

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
  const [state, setState] = useState(() => {
    const initial = parsePhoneInput(value ?? defaultValue ?? "");
    return {raw: initial.nationalNumber, callingCode: initial.callingCode, externalValue: value};
  });
  // Respond to parent resets (for example, the next traveller) without rewriting keystrokes.
  if (value !== undefined && value !== state.externalValue) {
    const next = parsePhoneInput(value);
    setState({raw: next.nationalNumber, callingCode: next.callingCode, externalValue: value});
  }
  const parsed = parsePhoneInput(state.raw, state.callingCode);
  const submittedValue = parsed.canonical;
  const errorId = `${name}-error`;
  const helpId = `${name}-help`;
  const previewId = `${name}-preview`;
  const displayedError = error || (parsed.invalid ? PHONE_ERROR : undefined);

  function update(raw: string, callingCode = state.callingCode, format = false) {
    const next = parsePhoneInput(raw, callingCode);
    setState({raw: format ? next.nationalNumber : raw, callingCode: format ? next.callingCode : callingCode, externalValue: next.canonical});
    onValueChange?.(next.canonical);
  }

  return <div className="field phone-field">
    <label htmlFor={`${name}-national`}>{label}{!required && " (optional)"}</label>
    <div className="phone-input-row">
      <input className="input phone-country" id={`${name}-code`} name={`${name}Country`} type="tel" inputMode="tel" autoComplete="tel-country-code" list={`${name}-country-codes`} aria-label={`${label} country code`} value={state.callingCode} maxLength={4} aria-describedby={`${helpId} ${previewId}`} onChange={event => update(state.raw, event.target.value)} onBlur={() => update(state.raw, state.callingCode, true)} />
      <datalist id={`${name}-country-codes`}>
        {PHONE_COUNTRIES.filter((country,index,countries) => countries.findIndex(other => other.callingCode === country.callingCode) === index).map(country => <option key={country.iso} value={`+${country.callingCode}`}>{country.name}</option>)}
      </datalist>
      <input className="input" id={`${name}-national`} type="tel" inputMode="tel" autoComplete="tel-national" required={required} value={state.raw} maxLength={32} aria-invalid={Boolean(displayedError)} aria-describedby={`${helpId} ${previewId}${displayedError ? ` ${errorId}` : ""}`} onChange={event => update(event.target.value)} onBlur={() => update(state.raw, state.callingCode, true)} />
    </div>
    <input type="hidden" name={name} value={submittedValue} />
    <small id={helpId}>{PHONE_HELP}</small>
    <small id={previewId} className="phone-preview" role="status">{submittedValue && !parsed.invalid ? `Number to use: ${submittedValue}` : "Country code can be edited above."}</small>
    {displayedError && <small className="field-error" id={errorId} role="alert">{displayedError}</small>}
  </div>;
}
