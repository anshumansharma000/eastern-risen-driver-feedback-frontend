"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { AdminDriver, DriverSource, LifecycleStatus, Vendor } from "@/lib/contracts";
import { getAdminDriver, passwordValidation, resetAdminDriverPassword } from "@/lib/account-api";
import { ApiError, apiRequest, errorMessage, getPaginated } from "@/lib/api";
import { driverMutationFromForm, validateAssignmentSettings, assignmentSettingsFromForm } from "@/lib/driver-scheduling";
import { formatDateTime, lifecycleStatus } from "@/lib/status";
import { DriverForm } from "./admin-drivers";
import { Modal } from "./modal";
import { PasswordField } from "./password-field";
import { EmptyState, ErrorAlert, LoadingCards, StatusBadge } from "./ui";

type Notice = { message: string; requestId?: string } | null;

export function AdminDriverDetail({ driverId }: { driverId: string }) {
  const [driver, setDriver] = useState<AdminDriver | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [source, setSource] = useState<DriverSource>("AGENCY");
  const [error, setError] = useState<Notice>(null);
  const [dialogError, setDialogError] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState<Notice>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [resetComplete, setResetComplete] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    setError(null); setNotFound(false);
    try {
      const next = await getAdminDriver(driverId);
      setDriver(next); setSource(next.sourceType);
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "DRIVER_NOT_FOUND") { setDriver(null); setNotFound(true); }
      else setError(notice(cause));
    }
  }, [driverId]);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);
  useEffect(() => {
    queueMicrotask(async () => {
      try { setVendors((await getPaginated<Vendor>("/api/v1/admin/vendors?status=ACTIVE&page=1&pageSize=100")).data); }
      catch { /* The current vendor remains available in the edit form. */ }
    });
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!driver || busy) return;
    const data = new FormData(event.currentTarget);
    const validation = validateAssignmentSettings(assignmentSettingsFromForm(data));
    if (validation) { setDialogError({ message: validation }); return; }
    setBusy(true); setDialogError(null);
    try {
      await apiRequest(`/api/v1/admin/drivers/${driver.id}`, { method: "PATCH", body: JSON.stringify(driverMutationFromForm(data, source)) });
      setEditing(false);
      await load();
    } catch (cause) { setDialogError(notice(cause)); }
    finally { setBusy(false); }
  }

  async function changeStatus(status: LifecycleStatus) {
    if (!driver || busy) return;
    setBusy(true); setError(null);
    try {
      await apiRequest(`/api/v1/admin/drivers/${driver.id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
      await load();
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "DRIVER_NOT_FOUND") { setDriver(null); setNotFound(true); }
      else setError(notice(cause));
    } finally { setBusy(false); }
  }

  function closeReset() {
    if (resetBusy) return;
    setResetOpen(false); setResetError(null); setNewPassword(""); setConfirmation("");
  }

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!driver || resetBusy || passwordValidation(newPassword, confirmation)) return;
    setResetBusy(true); setResetError(null); setResetComplete(false);
    try {
      await resetAdminDriverPassword(driver.id, { newPassword });
      setNewPassword(""); setConfirmation(""); setResetOpen(false); setResetComplete(true);
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "DRIVER_NOT_FOUND") {
        setNewPassword(""); setConfirmation(""); setResetOpen(false); setDriver(null); setNotFound(true);
      } else setResetError(notice(cause));
    } finally { setResetBusy(false); }
  }

  if (notFound) return <><Link className="text-link feedback-back" href="/admin/drivers">← Back to drivers</Link><EmptyState title="Driver not found">This driver is no longer available. Refresh the directory before continuing.</EmptyState></>;
  if (!driver && !error) return <LoadingCards />;
  if (!driver) return <><ErrorAlert {...error!} /><button className="button button-secondary" onClick={() => void load()}>Try again</button></>;
  const state = lifecycleStatus[driver.status];
  return <>
    <Link className="text-link feedback-back" href="/admin/drivers">← Back to drivers</Link>
    <div className="page-header"><div><p className="eyebrow">Driver account</p><h1>{driver.displayName}</h1><p>{driver.driverCode} · {driver.email}</p></div><StatusBadge {...state} /></div>
    <div className="toolbar detail-actions">
      {driver.status !== "ARCHIVED" && <><button className="button button-secondary" disabled={busy} onClick={() => { setDialogError(null); setEditing(true); }}>Manage settings and leave</button><button className="button button-danger" disabled={busy} onClick={() => { setResetComplete(false); setResetError(null); setResetOpen(true); }}>Reset driver password</button></>}
      {driver.status === "ACTIVE" && <button className="button button-secondary" disabled={busy} onClick={() => void changeStatus("DEACTIVATED")}>Deactivate</button>}
      {driver.status === "DEACTIVATED" && <><button className="button button-secondary" disabled={busy} onClick={() => void changeStatus("ACTIVE")}>Activate</button><button className="button button-secondary" disabled={busy} onClick={() => void changeStatus("ARCHIVED")}>Archive</button></>}
    </div>
    {error && <ErrorAlert {...error} />}
    {resetComplete && <div className="alert alert-info" role="status">Password reset. The driver must sign in with the new password.</div>}
    <div className="gap-grid driver-detail-grid">
      <DetailCard title="Identity and contact">
        <Row label="Display name" value={driver.displayName} /><Row label="Email" value={driver.email} /><Row label="Phone" value={driver.phone || "Not provided"} /><Row label="Driver code" value={driver.driverCode} /><Row label="Account ID" value={driver.accountId} />
      </DetailCard>
      <DetailCard title="Operations">
        <Row label="Lifecycle" value={state.label} /><Row label="Assignment" value={driver.assignmentEnabled ? "Enabled" : "Disabled"} /><Row label="Source" value={driver.sourceType === "AGENCY" ? "Agency" : `Outsourced · ${driver.vendorName || "Vendor not listed"}`} /><Row label="Shift" value={driver.shiftStartTime && driver.shiftEndTime ? `${driver.shiftStartTime}–${driver.shiftEndTime}` : "No shift restriction"} /><Row label="Timezone" value={driver.timeZone} /><Row label="Daily duty limit" value={formatDuty(driver.maxDailyDutyMinutes)} />
      </DetailCard>
      <DetailCard title="Lifecycle timestamps">
        <Row label="Created" value={formatDateTime(driver.createdAt, driver.timeZone)} /><Row label="Updated" value={formatDateTime(driver.updatedAt, driver.timeZone)} /><Row label="Archived" value={driver.archivedAt ? formatDateTime(driver.archivedAt, driver.timeZone) : "Not archived"} />
      </DetailCard>
    </div>
    {editing && <Modal onDismiss={() => !busy && setEditing(false)}><DriverForm dialog={{ mode: "edit", driver }} vendors={vendors} source={source} setSource={setSource} busy={busy} error={dialogError} onSubmit={save} onCancel={() => setEditing(false)} /></Modal>}
    {resetOpen && <ResetPasswordDialog driver={driver} newPassword={newPassword} confirmation={confirmation} busy={resetBusy} error={resetError} onNewPassword={setNewPassword} onConfirmation={setConfirmation} onCancel={closeReset} onSubmit={resetPassword} />}
  </>;
}

function ResetPasswordDialog({ driver, newPassword, confirmation, busy, error, onNewPassword, onConfirmation, onCancel, onSubmit }: {
  driver: AdminDriver;
  newPassword: string;
  confirmation: string;
  busy: boolean;
  error: Notice;
  onNewPassword: (value: string) => void;
  onConfirmation: (value: string) => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const validation = passwordValidation(newPassword, confirmation);
  const showMismatch = confirmation.length > 0 && newPassword !== confirmation;
  return <Modal onDismiss={onCancel}>
    <form className="dialog" role="dialog" aria-modal="true" aria-labelledby="reset-driver-title" aria-describedby="reset-driver-description" onSubmit={onSubmit} noValidate>
      <p className="eyebrow">Sensitive account action</p>
      <h2 id="reset-driver-title" tabIndex={-1}>Reset driver password</h2>
      <div id="reset-driver-description">
        <p>Set a new password for <strong>{driver.displayName}</strong>.</p>
        <dl className="definition-list reset-target"><Row label="Driver ID" value={driver.driverCode} /><Row label="Account record" value={driver.id} /></dl>
        <div className="alert alert-warning">All of this driver’s signed-in sessions will end immediately. You are responsible for communicating the new password outside this product.</div>
      </div>
      {error && <ErrorAlert {...error} />}
      <PasswordField name="newPassword" label="New password" autoComplete="new-password" minLength={12} maxLength={128} value={newPassword} onChange={(event) => onNewPassword(event.target.value)} aria-describedby="direct-password-help" />
      <p className="field-help" id="direct-password-help">Between 12 and 128 characters.</p>
      <PasswordField name="confirmation" label="Confirm new password" autoComplete="new-password" minLength={12} maxLength={128} value={confirmation} onChange={(event) => onConfirmation(event.target.value)} aria-invalid={showMismatch} aria-describedby={showMismatch ? "direct-confirmation-error" : undefined} />
      {showMismatch && <p className="field-error" id="direct-confirmation-error" role="alert">The new passwords do not match.</p>}
      <div className="dialog-actions"><button type="button" className="button button-secondary" disabled={busy} onClick={onCancel}>Cancel</button><button className="button button-danger" disabled={busy || Boolean(validation)}>{busy ? "Setting password…" : "Set new password"}</button></div>
    </form>
  </Modal>;
}

function DetailCard({ title, children }: { title: string; children: React.ReactNode }) { return <section className="card profile-card"><h2>{title}</h2><dl className="definition-list">{children}</dl></section>; }
function Row({ label, value }: { label: string; value: string }) { return <div><dt>{label}</dt><dd>{value}</dd></div>; }
function notice(cause: unknown) { return { message: errorMessage(cause), requestId: cause instanceof ApiError ? cause.requestId : undefined }; }
function formatDuty(minutes: number) { const hours = Math.floor(minutes / 60); const rest = minutes % 60; return [hours && `${hours} hour${hours === 1 ? "" : "s"}`, rest && `${rest} minute${rest === 1 ? "" : "s"}`].filter(Boolean).join(" "); }
