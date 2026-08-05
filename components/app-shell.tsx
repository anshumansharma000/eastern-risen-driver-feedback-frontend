"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Brand } from "./brand";
import { ApiError, apiRequest, getData } from "@/lib/api";
import type { Principal } from "@/lib/contracts";

const driverNav = [
  ["/driver", "Journeys"],
  ["/driver/performance", "Performance"],
  ["/driver/pending-sync", "Sync status"],
  ["/driver/profile", "Profile"],
] as const;
const driverPrimaryNav = [
  ["/driver", "Journeys", "journeys"],
  ["/driver/performance", "Performance", "performance"],
  ["/driver/pending-sync", "Sync", "sync"],
] as const;
const adminNav = [
  ["/admin", "Overview"],
  ["/admin/bookings", "Bookings"],
  ["/admin/trips", "Trips"],
  ["/admin/drivers", "Drivers"],
  ["/admin/vendors", "Vendors"],
  ["/admin/vehicles", "Vehicles"],
  ["/admin/questionnaires", "Questionnaires"],
  ["/admin/consent", "Consent"],
  ["/admin/feedback", "Feedback"],
  ["/admin/rewards", "Rewards"],
  ["/admin/reports", "Reports"],
  ["/admin/settings", "Settings"],
  ["/admin/profile", "Account"],
] as const;

export function AppShell({
  role,
  children,
}: {
  role: "driver" | "admin";
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const nav = role === "driver" ? driverNav : adminNav;
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const unavailable = new Set(["/admin/rewards", "/admin/reports"]);
  const refreshIdentity = useCallback(async () => {
    try {
      const result = await getData<{ user: Principal }>("/api/v1/auth/me");
      if (result.user.role !== role.toUpperCase()) {
        router.replace(result.user.role === "ADMIN" ? "/admin" : "/driver");
        return;
      }
      setPrincipal(result.user);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 403)
        router.replace(`/${role === "admin" ? "driver" : "admin"}/login`);
    } finally {
      setCheckingSession(false);
    }
  }, [role, router]);
  useEffect(() => {
    queueMicrotask(() => void refreshIdentity());
    window.addEventListener("identity-refresh", refreshIdentity);
    return () =>
      window.removeEventListener("identity-refresh", refreshIdentity);
  }, [refreshIdentity]);
  useEffect(() => {
    if (!profileMenuOpen) return;
    const close = (event: PointerEvent) => {
      if (!profileMenuRef.current?.contains(event.target as Node))
        setProfileMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setProfileMenuOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [profileMenuOpen]);
  async function logout() {
    setProfileMenuOpen(false);
    try {
      await apiRequest("/api/v1/auth/logout", { method: "POST" });
    } finally {
      router.replace(`/${role}/login`);
    }
  }
  const navigation = (label: string) => (
    <nav className="side-nav" aria-label={label}>
      {nav.map(([href, itemLabel]) => {
        const active = navigationActive(pathname, href, role);
        return (
          <Link
            onClick={() => setMobileNavOpen(false)}
            key={href}
            href={href}
            data-active={active}
            aria-current={active ? "page" : undefined}
            className={unavailable.has(href) ? "unavailable-link" : undefined}
          >
            {itemLabel}
            {unavailable.has(href) && <small>Soon</small>}
          </Link>
        );
      })}
    </nav>
  );
  if (checkingSession)
    return (
      <main className="page" aria-busy="true">
        <p>Checking your secure session…</p>
      </main>
    );
  const currentPath = normalizePath(pathname);
  const driverContextScreen =
    role === "driver" &&
    (currentPath === "/driver/profile" ||
      currentPath.startsWith("/driver/trips/"));
  const initials = accountInitials(principal?.displayName);
  return (
    <div
      className={`app-layout ${role === "driver" ? "driver-shell" : "admin-shell"}`}
    >
      <aside className="sidebar">
        <Brand />
        {navigation(`${role} navigation`)}
        <div className="side-footer">
          <p>Eastern Risen Expedition Pvt. Ltd.</p>
          <button
            type="button"
            onClick={logout}
            className="button button-secondary button-block"
          >
            Sign out
          </button>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <span className="mobile-brand">
            {driverContextScreen ? (
              <Link
                className="mobile-back"
                href="/driver"
                aria-label="Back to journeys"
              >
                <span aria-hidden="true">←</span>
                <strong>Journeys</strong>
              </Link>
            ) : (
              <Brand compact href={role === "driver" ? "/driver" : "/"} />
            )}
          </span>
          <span className="eyebrow workspace-label">
            {role === "driver" ? "Driver workspace" : "Operations workspace"}
          </span>
          <span className="account">
            {principal?.displayName && <strong>{principal.displayName}</strong>}
            <span className="status status-success">Secure session</span>
          </span>
          {role === "driver" ? (
            <div className="driver-profile-menu" ref={profileMenuRef}>
              <button
                className="driver-profile-button"
                type="button"
                aria-label="Open account menu"
                aria-haspopup="dialog"
                aria-expanded={profileMenuOpen}
                aria-controls="driver-account-menu"
                onClick={() => setProfileMenuOpen((current) => !current)}
              >
                {initials}
              </button>
              {profileMenuOpen && (
                <div
                  className="driver-profile-popover"
                  id="driver-account-menu"
                  role="dialog"
                  aria-label="Driver account"
                >
                  <div className="driver-profile-summary">
                    <span className="driver-profile-avatar" aria-hidden="true">
                      {initials}
                    </span>
                    <span>
                      <strong>
                        {principal?.displayName || "Driver account"}
                      </strong>
                      <small>Secure driver session</small>
                    </span>
                  </div>
                  <Link
                    href="/driver/profile"
                    onClick={() => setProfileMenuOpen(false)}
                  >
                    View profile
                  </Link>
                  <button type="button" onClick={logout}>
                    Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              className="mobile-menu-button"
              type="button"
              aria-expanded={mobileNavOpen}
              aria-controls="mobile-navigation"
              onClick={() => setMobileNavOpen((current) => !current)}
            >
              {mobileNavOpen ? "Close" : "Menu"}
            </button>
          )}
        </header>
        {mobileNavOpen && (
          <div className="mobile-nav-panel" id="mobile-navigation">
            {navigation(`${role} mobile navigation`)}
            <button
              type="button"
              onClick={logout}
              className="button button-secondary button-block"
            >
              Sign out
            </button>
          </div>
        )}
        {children}
      </div>
      {role === "driver" && (
        <nav
          className="driver-bottom-nav"
          aria-label="Driver primary navigation"
        >
          {driverPrimaryNav.map(([href, label, icon]) => {
            const active = driverPrimaryActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                data-active={active}
                aria-current={active ? "page" : undefined}
              >
                <DriverNavIcon name={icon} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}

function driverPrimaryActive(pathname: string, href: string) {
  const current = normalizePath(pathname);
  if (href === "/driver")
    return (
      current === "/driver" ||
      current === "/driver/trips" ||
      current.startsWith("/driver/trips/")
    );
  return current === href || current.startsWith(`${href}/`);
}

function navigationActive(
  pathname: string,
  href: string,
  role: "driver" | "admin",
) {
  const current = normalizePath(pathname);
  if (role === "driver" && href === "/driver")
    return (
      current === "/driver" ||
      current === "/driver/trips" ||
      current.startsWith("/driver/trips/")
    );
  return current === href || current.startsWith(`${href}/`);
}

function normalizePath(pathname: string) {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

function accountInitials(name?: string) {
  if (!name?.trim()) return "DR";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function DriverNavIcon({ name }: { name: string }) {
  return (
    <span
      className={`driver-nav-icon driver-nav-icon-${name}`}
      aria-hidden="true"
    >
      <i />
      <i />
      <i />
    </span>
  );
}
