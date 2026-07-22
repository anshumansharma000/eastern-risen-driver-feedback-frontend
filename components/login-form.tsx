"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiRequest, errorMessage } from "@/lib/api";
import type { DataResponse, Principal } from "@/lib/contracts";

export function LoginForm({ role }: { role: "driver" | "admin" }) {
  const router = useRouter(); const [busy,setBusy]=useState(false); const [error,setError]=useState<{message:string;requestId?:string}|null>(null);
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
    {error && <div className="alert" role="alert">{error.message}{error.requestId && <small><br/>Request ID: {error.requestId}</small>}</div>}
    <div className="field"><label htmlFor="identity">{role === "driver" ? "Driver code" : "Email address"}</label><input className="input" id="identity" name="identity" type={role === "admin" ? "email" : "text"} autoComplete={role === "admin" ? "username" : "off"} maxLength={role === "admin" ? 320 : 64} required /></div>
    <div className="field"><label htmlFor="password">Password</label><input className="input" id="password" name="password" type="password" autoComplete="current-password" maxLength={128} required /></div>
    <button className="button button-block" disabled={busy}>{busy ? "Signing in…" : "Sign in securely"}</button>
    <div className="alert alert-info">Password reset is not available yet because the backend endpoint has not been implemented.</div>
  </form>;
}
