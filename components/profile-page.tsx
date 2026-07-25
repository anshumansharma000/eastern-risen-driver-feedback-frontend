"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  changePassword,
  changedProfileFields,
  clearPrivateClientState,
  getAdminProfile,
  getDriverProfile,
  passwordValidation,
  updateAdminProfile,
  updateDriverProfile,
  type ProfileRole,
} from "@/lib/account-api";
import { ApiError, errorMessage, getData } from "@/lib/api";
import type { AdminProfile, DriverProfile, Principal } from "@/lib/contracts";
import { formatDateTime, lifecycleStatus } from "@/lib/status";
import { ErrorAlert, LoadingCards, StatusBadge } from "./ui";
import { PasswordField } from "./password-field";

type Profile = AdminProfile | DriverProfile;
type Notice = { message: string; requestId?: string } | null;
type FieldErrors = Partial<Record<"displayName" | "email" | "phone" | "currentPassword" | "newPassword" | "confirmation", string>>;

export function ProfilePage({ role }: { role: ProfileRole }) {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadError, setLoadError] = useState<Notice>(null);
  const [profileError, setProfileError] = useState<Notice>(null);
  const [passwordError, setPasswordError] = useState<Notice>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [saved, setSaved] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setProfile(role === "admin" ? await getAdminProfile() : await getDriverProfile());
    } catch (cause) {
      setLoadError(toNotice(cause));
    }
  }, [role]);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || savingProfile) return;
    const data = new FormData(event.currentTarget);
    const draft = role === "admin"
      ? { displayName: String(data.get("displayName") || "").trim(), email: String(data.get("email") || "").trim() }
      : { displayName: String(data.get("displayName") || "").trim(), email: String(data.get("email") || "").trim(), phone: String(data.get("phone") || "").trim() || null };
    const original = role === "admin"
      ? { displayName: profile.displayName, email: profile.email }
      : { displayName: profile.displayName, email: profile.email, phone: (profile as DriverProfile).phone };
    const patch = changedProfileFields(original, draft, Object.keys(draft) as (keyof typeof draft)[]);
    setSaved(false); setProfileError(null); setFieldErrors({});
    if (!Object.keys(patch).length) { setSaved(true); return; }
    setSavingProfile(true);
    try {
      const updated = role === "admin"
        ? await updateAdminProfile(patch)
        : await updateDriverProfile(patch);
      setProfile(updated);
      setSaved(true);
      await getData<{ user: Principal }>("/api/v1/auth/me");
      window.dispatchEvent(new Event("identity-refresh"));
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "ACCOUNT_EMAIL_ALREADY_EXISTS") setFieldErrors({ email: errorMessage(cause) });
      else setProfileError(toNotice(cause));
    } finally { setSavingProfile(false); }
  }

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingPassword) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const currentPassword = String(data.get("currentPassword") || "");
    const newPassword = String(data.get("newPassword") || "");
    const confirmation = String(data.get("confirmation") || "");
    const validation = passwordValidation(newPassword, confirmation);
    setPasswordError(null); setFieldErrors({});
    if (validation) {
      setFieldErrors(validation.includes("match") ? { confirmation: validation } : { newPassword: validation });
      return;
    }
    setSavingPassword(true);
    try {
      await changePassword(role, { currentPassword, newPassword });
      form.reset();
      setSigningOut(true);
      clearPrivateClientState();
      window.setTimeout(() => router.replace(`/${role}/login?reason=password-changed`), 700);
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "CURRENT_PASSWORD_INVALID") setFieldErrors({ currentPassword: errorMessage(cause) });
      else if (cause instanceof ApiError && cause.code === "PASSWORD_REUSE_NOT_ALLOWED") setFieldErrors({ newPassword: errorMessage(cause) });
      else setPasswordError(toNotice(cause));
    } finally { setSavingPassword(false); }
  }

  if (signingOut) return <main className="page"><div className="alert alert-info" role="status">Password changed; sign in again.</div></main>;
  return <main className="page">
    <div className="page-header"><div><p className="eyebrow">Account and security</p><h1>Profile</h1><p>Keep your account identity current and protect access to your workspace.</p></div></div>
    {loadError && <><ErrorAlert {...loadError} /><button className="button button-secondary" onClick={() => void load()}>Try again</button></>}
    {!profile && !loadError && <LoadingCards />}
    {profile && <div className="profile-layout">
      <section className="card profile-card" aria-labelledby="profile-summary-title">
        <div className="section-heading"><div><p className="eyebrow">Account summary</p><h2 id="profile-summary-title">{profile.displayName}</h2></div><StatusBadge {...lifecycleStatus[profile.status]} /></div>
        <dl className="definition-list">
          <Detail label="Email" value={profile.email} />
          <Detail label="Last sign in" value={date(profile.lastLoginAt)} />
          <Detail label="Password changed" value={date(profile.passwordChangedAt)} />
        </dl>
      </section>
      <section className="card profile-card" aria-labelledby="profile-edit-title">
        <p className="eyebrow">Personal details</p><h2 id="profile-edit-title">Edit profile</h2>
        {profileError && <ErrorAlert {...profileError} />}
        {saved && !profileError && <div className="alert alert-info" role="status">Profile saved.</div>}
        <form onSubmit={saveProfile} noValidate>
          <ProfileField name="displayName" label="Display name" defaultValue={profile.displayName} maxLength={200} error={fieldErrors.displayName} />
          <ProfileField name="email" label="Email address" type="email" defaultValue={profile.email} maxLength={320} error={fieldErrors.email} />
          {role === "driver" && <ProfileField name="phone" label="Phone (optional)" defaultValue={(profile as DriverProfile).phone || ""} maxLength={32} required={false} error={fieldErrors.phone} />}
          <button className="button" disabled={savingProfile}>{savingProfile ? "Saving…" : "Save profile"}</button>
        </form>
      </section>
      {role === "driver" && <OperationalDetails profile={profile as DriverProfile} />}
      <section className="card profile-card security-card" aria-labelledby="password-title">
        <p className="eyebrow">Security</p><h2 id="password-title">Change password</h2>
        <p>Use 12–128 characters. Changing it signs out every session, including this one.</p>
        {passwordError && <ErrorAlert {...passwordError} />}
        <form onSubmit={savePassword} noValidate>
          <PasswordField name="currentPassword" label="Current password" autoComplete="current-password" maxLength={128} aria-describedby={fieldErrors.currentPassword ? "currentPassword-error" : undefined} aria-invalid={Boolean(fieldErrors.currentPassword)} />
          {fieldErrors.currentPassword && <p className="field-error" id="currentPassword-error">{fieldErrors.currentPassword}</p>}
          <PasswordField name="newPassword" label="New password" autoComplete="new-password" minLength={12} maxLength={128} aria-describedby="newPassword-help newPassword-error" aria-invalid={Boolean(fieldErrors.newPassword)} />
          <p className="field-help" id="newPassword-help">Between 12 and 128 characters.</p>
          {fieldErrors.newPassword && <p className="field-error" id="newPassword-error">{fieldErrors.newPassword}</p>}
          <PasswordField name="confirmation" label="Confirm new password" autoComplete="new-password" minLength={12} maxLength={128} aria-describedby={fieldErrors.confirmation ? "confirmation-error" : undefined} aria-invalid={Boolean(fieldErrors.confirmation)} />
          {fieldErrors.confirmation && <p className="field-error" id="confirmation-error">{fieldErrors.confirmation}</p>}
          <button className="button" disabled={savingPassword}>{savingPassword ? "Changing password…" : "Change password and sign out"}</button>
        </form>
      </section>
    </div>}
  </main>;
}

function OperationalDetails({ profile }: { profile: DriverProfile }) {
  return <section className="card profile-card profile-operational" aria-labelledby="operational-title">
    <p className="eyebrow">Admin-managed information</p><h2 id="operational-title">Work settings</h2>
    <p>Contact an administrator if any of these details need correcting.</p>
    <dl className="definition-list detail-columns">
      <Detail label="Driver code" value={profile.driverCode} />
      <Detail label="Source" value={profile.sourceType === "AGENCY" ? "Agency" : `Outsourced · ${profile.vendorName || "Vendor not listed"}`} />
      <Detail label="Assignment" value={profile.assignmentEnabled ? "Enabled" : "Disabled"} />
      <Detail label="Shift" value={profile.shiftStartTime && profile.shiftEndTime ? `${profile.shiftStartTime}–${profile.shiftEndTime}` : "No shift restriction"} />
      <Detail label="Timezone" value={profile.timeZone} />
      <Detail label="Daily duty limit" value={duty(profile.maxDailyDutyMinutes)} />
    </dl>
  </section>;
}

function ProfileField({ name, label, error, required = true, ...props }: { name: string; label: string; error?: string; required?: boolean; type?: string; defaultValue: string; maxLength: number }) {
  const errorId = `${name}-error`;
  return <div className="field"><label htmlFor={name}>{label}</label><input className="input" id={name} name={name} required={required} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} {...props} />{error && <small className="field-error" id={errorId}>{error}</small>}</div>;
}
function Detail({ label, value }: { label: string; value: string }) { return <div><dt>{label}</dt><dd>{value}</dd></div>; }
function date(value: string | null) { return value ? formatDateTime(value, "Asia/Kolkata") : "Not recorded"; }
function duty(minutes: number) { const hours = Math.floor(minutes / 60); const rest = minutes % 60; return `${hours ? `${hours} hr` : ""}${hours && rest ? " " : ""}${rest ? `${rest} min` : ""}`; }
function toNotice(cause: unknown) { return { message: errorMessage(cause), requestId: cause instanceof ApiError ? cause.requestId : undefined }; }
