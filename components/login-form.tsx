"use client";

import { FormEvent, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiRequest, errorMessage } from "@/lib/api";
import type { DataResponse, Principal } from "@/lib/contracts";
import { PasswordField } from "./password-field";
import { ErrorAlert } from "./ui";

export function LoginForm({ role }: { role: "driver" | "admin" }) {
  const router = useRouter(); const [busy,setBusy]=useState(false); const [error,setError]=useState<{message:string;requestId?:string}|null>(null);
  const sessionExpired=useSyncExternalStore(
    () => () => undefined,
    () => new URLSearchParams(window.location.search).get("reason")==="session-expired",
    () => false,
  );
  const transitionReason=useSyncExternalStore(
    () => () => undefined,
    () => new URLSearchParams(window.location.search).get("reason"),
    () => null,
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null); const form = new FormData(event.currentTarget);
    const body = role === "driver" ? { driverCode: form.get("identity"), password: form.get("password") } : { email: form.get("identity"), password: form.get("password") };
    try {
      const response = await apiRequest<DataResponse<{user:Principal;expiresAt:string}>>(`/api/v1/auth/${role}/login`, { method:"POST", body:JSON.stringify(body) });
      if (response.data.user.role !== role.toUpperCase()) throw new Error("Role mismatch");
      router.replace(role === "driver" ? "/driver" : "/admin");
    } catch (cause) { setError({ message:errorMessage(cause), requestId:cause instanceof ApiError ? cause.requestId : undefined }); } finally { setBusy(false); }
  }
  return <form className="auth-form" onSubmit={submit} noValidate><p className="eyebrow">Secure access</p><h2>{role === "driver" ? "Welcome back" : "Operations sign in"}</h2><p>{role === "driver" ? "Use your driver code to access today’s journeys." : "Use your administrator account to manage Eastern Risen operations."}</p>
    {sessionExpired && !error && <div className="alert alert-info" role="status">Your session expired. Sign in again to continue.</div>}
    {transitionReason === "password-changed" && !error && <div className="alert alert-info" role="status">Password changed; sign in again.</div>}
    {error && <ErrorAlert {...error} />}
    <div className="field"><label htmlFor="identity">{role === "driver" ? "Driver code" : "Email address"}</label><input className="input" id="identity" name="identity" type={role === "admin" ? "email" : "text"} autoComplete="username" maxLength={role === "admin" ? 320 : 64} required /></div>
    <PasswordField id="password" name="password" label="Password" autoComplete="current-password" maxLength={128} />
    <button className="button button-block" disabled={busy}>{busy ? "Signing in…" : "Sign in securely"}</button>
    {role === "driver" && <p className="field-help">Forgot your password? Contact an administrator to have it reset.</p>}
  </form>;
}
