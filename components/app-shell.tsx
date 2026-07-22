"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Brand } from "./brand";
import { apiRequest } from "@/lib/api";

const driverNav = [
  ["/driver", "Journeys"], ["/driver/performance", "Performance"], ["/driver/pending-sync", "Sync status"],
] as const;
const adminNav = [
  ["/admin", "Overview"], ["/admin/trips", "Trips"], ["/admin/drivers", "Drivers"], ["/admin/vendors", "Vendors"], ["/admin/vehicles", "Vehicles"], ["/admin/questionnaires", "Questionnaires"], ["/admin/consent", "Consent"], ["/admin/feedback", "Feedback"], ["/admin/rewards", "Rewards"], ["/admin/reports", "Reports"], ["/admin/settings", "Settings"],
] as const;

export function AppShell({ role, children }: { role: "driver" | "admin"; children: ReactNode }) {
  const pathname = usePathname(); const router = useRouter(); const nav = role === "driver" ? driverNav : adminNav;
  const unavailable = new Set(["/driver/performance", "/admin/feedback", "/admin/rewards", "/admin/reports", "/admin/settings"]);
  async function logout() { try { await apiRequest("/api/v1/auth/logout", { method: "POST" }); } finally { router.replace(`/${role}/login`); } }
  return <div className="app-layout">
    <aside className="sidebar"><Brand />
      <nav className="side-nav" aria-label={`${role} navigation`}>
        {nav.map(([href,label]) => <Link key={href} href={href} data-active={pathname === href || (href !== `/${role}` && pathname.startsWith(`${href}/`))} className={unavailable.has(href) ? "unavailable-link" : undefined}>{label}{unavailable.has(href) && <small>Soon</small>}</Link>)}
      </nav>
      <div className="side-footer"><p>Eastern Risen Expedition Pvt. Ltd.</p><button type="button" onClick={logout} className="button button-secondary button-block">Sign out</button></div>
    </aside>
    <div className="app-main"><header className="topbar"><span className="mobile-brand"><Brand compact /></span><span className="eyebrow">{role === "driver" ? "Driver workspace" : "Operations workspace"}</span><span className="account"><span className="status status-success">Secure session</span></span></header>{children}</div>
  </div>;
}
