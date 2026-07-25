"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Brand } from "./brand";
import { ApiError, apiRequest, getData } from "@/lib/api";
import type { Principal } from "@/lib/contracts";

const driverNav = [
  ["/driver", "Journeys"], ["/driver/performance", "Performance"], ["/driver/pending-sync", "Sync status"], ["/driver/profile", "Profile"],
] as const;
const adminNav = [
  ["/admin", "Overview"], ["/admin/trips", "Trips"], ["/admin/drivers", "Drivers"], ["/admin/vendors", "Vendors"], ["/admin/vehicles", "Vehicles"], ["/admin/questionnaires", "Questionnaires"], ["/admin/consent", "Consent"], ["/admin/feedback", "Feedback"], ["/admin/rewards", "Rewards"], ["/admin/reports", "Reports"], ["/admin/settings", "Settings"], ["/admin/profile", "Account"],
] as const;

export function AppShell({ role, children }: { role: "driver" | "admin"; children: ReactNode }) {
  const pathname = usePathname(); const router = useRouter(); const nav = role === "driver" ? driverNav : adminNav;
  const [mobileNavOpen,setMobileNavOpen]=useState(false);
  const [principal,setPrincipal]=useState<Principal|null>(null);
  const [checkingSession,setCheckingSession]=useState(true);
  const unavailable = new Set(["/admin/rewards", "/admin/reports"]);
  const refreshIdentity=useCallback(async()=>{
    try {
      const result=await getData<{user:Principal}>("/api/v1/auth/me");
      if(result.user.role!==role.toUpperCase()){
        router.replace(result.user.role==="ADMIN"?"/admin":"/driver");
        return;
      }
      setPrincipal(result.user);
    } catch(cause) {
      if(cause instanceof ApiError&&cause.status===403) router.replace(`/${role==="admin"?"driver":"admin"}/login`);
    } finally { setCheckingSession(false); }
  },[role,router]);
  useEffect(()=>{queueMicrotask(()=>void refreshIdentity());window.addEventListener("identity-refresh",refreshIdentity);return()=>window.removeEventListener("identity-refresh",refreshIdentity)},[refreshIdentity]);
  async function logout() { try { await apiRequest("/api/v1/auth/logout", { method: "POST" }); } finally { router.replace(`/${role}/login`); } }
  const navigation=(label:string)=><nav className="side-nav" aria-label={label}>
    {nav.map(([href,itemLabel]) => <Link onClick={()=>setMobileNavOpen(false)} key={href} href={href} data-active={pathname === href || (href !== `/${role}` && pathname.startsWith(`${href}/`))} className={unavailable.has(href) ? "unavailable-link" : undefined}>{itemLabel}{unavailable.has(href) && <small>Soon</small>}</Link>)}
  </nav>;
  if(checkingSession)return <main className="page" aria-busy="true"><p>Checking your secure session…</p></main>;
  return <div className="app-layout">
    <aside className="sidebar"><Brand />
      {navigation(`${role} navigation`)}
      <div className="side-footer"><p>Eastern Risen Expedition Pvt. Ltd.</p><button type="button" onClick={logout} className="button button-secondary button-block">Sign out</button></div>
    </aside>
    <div className="app-main"><header className="topbar"><span className="mobile-brand"><Brand compact /></span><span className="eyebrow workspace-label">{role === "driver" ? "Driver workspace" : "Operations workspace"}</span><span className="account">{principal?.displayName && <strong>{principal.displayName}</strong>}<span className="status status-success">Secure session</span></span><button className="mobile-menu-button" type="button" aria-expanded={mobileNavOpen} aria-controls="mobile-navigation" onClick={()=>setMobileNavOpen(current=>!current)}>{mobileNavOpen?"Close":"Menu"}</button></header>
      {mobileNavOpen&&<div className="mobile-nav-panel" id="mobile-navigation">{navigation(`${role} mobile navigation`)}<button type="button" onClick={logout} className="button button-secondary button-block">Sign out</button></div>}
      {children}
    </div>
  </div>;
}
