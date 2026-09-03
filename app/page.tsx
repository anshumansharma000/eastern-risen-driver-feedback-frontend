"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Brand } from "@/components/brand";
import { ApiError, errorMessage, getData } from "@/lib/api";
import type { Principal } from "@/lib/contracts";

export default function Home() {
  const router = useRouter();
  const [state, setState] = useState<"checking" | "guest" | "error">("checking");
  const [sessionError, setSessionError] = useState("");

  const resolveSession = useCallback(async () => {
    setState("checking");
    setSessionError("");
    try {
      const { user } = await getData<{ user: Principal }>("/api/v1/auth/me");
      router.replace(user.role === "ADMIN" ? "/admin" : "/driver");
    } catch (cause) {
      if (cause instanceof ApiError && (cause.status === 401 || cause.status === 403)) {
        setState("guest");
        return;
      }
      setSessionError(errorMessage(cause));
      setState("error");
    }
  }, [router]);

  useEffect(() => {
    queueMicrotask(() => void resolveSession());
  }, [resolveSession]);

  if (state === "checking") {
    return <main className="welcome-page welcome-session-state" aria-busy="true"><p>Checking your secure session…</p></main>;
  }

  if (state === "error") {
    return <main className="welcome-page welcome-session-state"><div className="alert" role="alert">{sessionError}</div><button className="button button-secondary" type="button" onClick={() => void resolveSession()}>Try again</button></main>;
  }

  return (
    <main className="welcome-page">
      <div className="horizon" aria-hidden="true" />
      <header className="welcome-header"><Brand /></header>
      <section className="welcome-hero">
        <p className="eyebrow">Driver feedback service</p>
        <h1>Every journey leaves an impression.</h1>
        <p className="lede">Choose the workspace that belongs to you. Passenger feedback opens only after a driver starts a secure handoff.</p>
        <div className="role-grid">
          <Link className="role-card role-card-primary" href="/driver/login">
            <span className="role-index">01</span><strong>Driver workspace</strong><span>Find a trip, enter one manually, or begin a passenger handoff.</span><b>Driver sign in →</b>
          </Link>
          <Link className="role-card" href="/admin/login">
            <span className="role-index">02</span><strong>Operations admin</strong><span>Manage the fleet, trips, questionnaires, and consent versions.</span><b>Admin sign in →</b>
          </Link>
        </div>
        <p className="privacy-note">Passenger mode has no public entry point and never exposes driver or admin navigation.</p>
      </section>
    </main>
  );
}
