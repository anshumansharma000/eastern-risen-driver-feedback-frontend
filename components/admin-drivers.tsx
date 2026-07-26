"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import type { AdminDriver, DriverLeave, DriverSource, LifecycleStatus, Vendor } from "@/lib/contracts";
import { ApiError, apiRequest, errorMessage, getPaginated } from "@/lib/api";
import { formatDateTime, lifecycleStatus } from "@/lib/status";
import { assignmentSettingsFromForm, driverMutationFromForm, validateAssignmentSettings } from "@/lib/driver-scheduling";
import { listQuery, pageAfterRemovingLastItem, totalPages } from "@/lib/pagination";
import { EmptyState, ErrorAlert, LoadingCards, StatusBadge } from "./ui";
import { Modal } from "./modal";
import { PasswordField } from "./password-field";
import { PaginationControl, useListSearchParams, usePaginatedList } from "./pagination";
import { Combobox, type ComboboxOption } from "./combobox";
import { AlertDialog } from "./alert-dialog";

export type DriverDialog = { mode: "create" } | { mode: "edit"; driver: AdminDriver };
type FormError = { message: string; requestId?: string } | null;
const defaultTimeZone = "Asia/Kolkata";

export function AdminDrivers() {
  const search = useListSearchParams();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const statusValues: LifecycleStatus[] = ["ACTIVE", "DEACTIVATED", "ARCHIVED"];
  const requestedStatus = search.parameters.get("status") as LifecycleStatus | null;
  const status = requestedStatus && statusValues.includes(requestedStatus) ? requestedStatus : "ACTIVE";
  const path = search.ready ? `/api/v1/admin/drivers?${listQuery({ status, page: search.page, pageSize: search.pageSize })}` : null;
  const list = usePaginatedList<AdminDriver>(path);
  const [dialog, setDialog] = useState<DriverDialog | null>(null);
  const [source, setSource] = useState<DriverSource>("AGENCY");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<FormError>(null);
  const [dialogError, setDialogError] = useState<FormError>(null);

  const loadVendors = useCallback(async () => {
    setError(null);
    try {
      const vendorList = await getPaginated<Vendor>("/api/v1/admin/vendors?status=ACTIVE&page=1&pageSize=100");
      setVendors(vendorList.data);
    } catch (cause) {
      setError({ message: errorMessage(cause), requestId: cause instanceof ApiError ? cause.requestId : undefined });
    }
  }, []);
  useEffect(() => { queueMicrotask(() => void loadVendors()); }, [loadVendors]);
  useEffect(() => {
    if (!list.pagination) return;
    const lastPage = Math.max(1, totalPages(list.pagination.total, list.pagination.pageSize));
    if (search.page > lastPage) search.setPage(lastPage, lastPage);
  }, [list.pagination, search.page]); // eslint-disable-line react-hooks/exhaustive-deps

  function open(next: DriverDialog) {
    setDialogError(null); setSource(next.mode === "edit" ? next.driver.sourceType : "AGENCY"); setDialog(next);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialog || busy) return;
    const data = new FormData(event.currentTarget);
    const settings = assignmentSettingsFromForm(data);
    const validation = validateAssignmentSettings(settings);
    if (validation) { setDialogError({ message: validation }); return; }
    const body = driverMutationFromForm(data, source, dialog.mode === "create");
    setBusy(true); setDialogError(null);
    try {
      await apiRequest(dialog.mode === "create" ? "/api/v1/admin/drivers" : `/api/v1/admin/drivers/${dialog.driver.id}`, {
        method: dialog.mode === "create" ? "POST" : "PATCH", body: JSON.stringify(body),
      });
      setDialog(null); await list.refetch();
    } catch (cause) {
      setDialogError({ message: errorMessage(cause), requestId: cause instanceof ApiError ? cause.requestId : undefined });
    } finally { setBusy(false); }
  }

  async function changeStatus(driver: AdminDriver, next: LifecycleStatus) {
    setBusy(true);
    try {
      await apiRequest(`/api/v1/admin/drivers/${driver.id}/status`, { method: "PATCH", body: JSON.stringify({ status: next }) });
      const nextPage = pageAfterRemovingLastItem(search.page, list.items?.length ?? 0);
      if (nextPage !== search.page) search.setPage(nextPage);
      else await list.refetch();
    }
    catch (cause) { setError({ message: errorMessage(cause), requestId: cause instanceof ApiError ? cause.requestId : undefined }); }
    finally { setBusy(false); }
  }

  return <>
    <div className="page-header"><div><p className="eyebrow">Operations directory</p><h1>Drivers</h1><p>Manage driver accounts, assignment availability, shifts, daily duty limits, and leave.</p></div><button className="button" onClick={() => open({ mode: "create" })}>Add driver</button></div>
    <div className="toolbar"><select className="select" style={{ width: "auto" }} value={status} onChange={(event) => search.update({ status: event.target.value }, true)} aria-label="Filter by lifecycle"><option value="ACTIVE">Active</option><option value="DEACTIVATED">Deactivated</option><option value="ARCHIVED">Archived</option></select><button className="button button-secondary" disabled={list.loading} onClick={() => void list.refetch()}>Refresh</button></div>
    {(error || list.error) && <ErrorAlert message={(error || list.error)!.message} requestId={(error || list.error)!.requestId} />}
    {list.items === null && !list.error && <LoadingCards />}
    {list.items?.length === 0 && !error && !list.error && <EmptyState title={`No ${status.toLowerCase()} drivers`}>Create the first driver or choose another lifecycle filter.</EmptyState>}
    {list.items && list.items.length > 0 && <section className="card data-list" aria-busy={list.loading}><div className="data-row data-head"><span>Name</span><span>Assignment settings</span><span>Status</span><span>Actions</span></div>{list.items.map((driver) => {
      const state = lifecycleStatus[driver.status];
      const shift = driver.shiftStartTime && driver.shiftEndTime ? `${driver.shiftStartTime}–${driver.shiftEndTime}` : "No shift restriction";
      return <div className="data-row" key={driver.id}><span><Link className="text-link" href={`/admin/drivers/detail?driverId=${encodeURIComponent(driver.id)}`}><strong>{driver.displayName}</strong></Link><small>{driver.driverCode} · {driver.sourceType === "OUTSOURCED" ? driver.vendorName : "Agency driver"}</small></span><span><strong>{driver.assignmentEnabled ? shift : "Unavailable for assignment"}</strong><small>{driver.timeZone} · {formatDuty(driver.maxDailyDutyMinutes)}</small></span><span><StatusBadge label={driver.assignmentEnabled ? state.label : "Unavailable for assignment"} tone={driver.assignmentEnabled ? state.tone : "warning"} /></span><span className="trip-actions">{driver.status !== "ARCHIVED" && <button className="button button-secondary" disabled={busy} onClick={() => open({ mode: "edit", driver })}>Manage</button>}{driver.status === "ACTIVE" ? <button className="button button-secondary" disabled={busy} onClick={() => changeStatus(driver, "DEACTIVATED")}>Deactivate</button> : driver.status === "DEACTIVATED" ? <button className="button button-secondary" disabled={busy} onClick={() => changeStatus(driver, "ACTIVE")}>Activate</button> : null}</span></div>;
    })}</section>}
    {list.pagination && <PaginationControl {...list.pagination} page={search.page} loading={list.loading} onPageChange={(page) => search.setPage(page, totalPages(list.pagination!.total, list.pagination!.pageSize))} onPageSizeChange={search.setPageSize} />}
    {dialog && <Modal onDismiss={() => !busy && setDialog(null)}><DriverForm dialog={dialog} vendors={vendors} source={source} setSource={setSource} busy={busy} error={dialogError} onSubmit={save} onCancel={() => setDialog(null)} /></Modal>}
  </>;
}

export function DriverForm({ dialog, vendors, source, setSource, busy, error, onSubmit, onCancel }: {
  dialog: DriverDialog; vendors: Vendor[]; source: DriverSource; setSource: (value: DriverSource) => void; busy: boolean; error: FormError;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void; onCancel: () => void;
}) {
  const driver = dialog.mode === "edit" ? dialog.driver : undefined;
  const duty = driver?.maxDailyDutyMinutes ?? 720;
  const vendorOptions: ComboboxOption[] = vendors.map((vendor) => ({
    value: vendor.id,
    label: vendor.name,
    description: vendor.contactName || vendor.contactEmail || "Active vendor",
    keywords: `${vendor.contactName || ""} ${vendor.contactEmail || ""}`,
  }));
  if (driver?.vendorId && !vendors.some((vendor) => vendor.id === driver.vendorId)) {
    vendorOptions.unshift({ value: driver.vendorId, label: driver.vendorName || "Current vendor", description: "Current vendor association" });
  }
  return <form className="dialog dialog-wide" role="dialog" aria-modal="true" onSubmit={onSubmit}>
    <span className="eyebrow">{driver ? "Driver management" : "New driver"}</span><h2>{driver ? driver.displayName : "Add a driver"}</h2>
    {error && <ErrorAlert message={error.message} requestId={error.requestId} />}
    <Field name="displayName" label="Driver name" maxLength={200} defaultValue={driver?.displayName} />
    <Field name="email" label="Email" type="email" maxLength={320} defaultValue={driver?.email} />
    {dialog.mode === "create" && <PasswordField name="password" label="Temporary password" autoComplete="new-password" minLength={12} maxLength={128} />}
    <div className="grid-2"><Field name="driverCode" label="Driver code" maxLength={64} defaultValue={driver?.driverCode} /><Field name="phone" label="Phone (optional)" maxLength={32} required={false} defaultValue={driver?.phone || ""} /></div>
    <div className="field"><label htmlFor="sourceType">Driver source</label><select className="select" id="sourceType" value={source} onChange={(event) => setSource(event.target.value as DriverSource)}><option value="AGENCY">Agency</option><option value="OUTSOURCED">Outsourced</option></select></div>
    {source === "OUTSOURCED" && <Combobox id="vendorId" name="vendorId" label="Vendor" options={vendorOptions} defaultValue={driver?.vendorId || ""} placeholder="Search by vendor or contact" emptyMessage="No vendors match that search" hint="Searches the active vendors currently loaded." required />}
    <fieldset className="settings-group"><legend>Assignment settings</legend>
      <label className="check-row"><input type="checkbox" name="assignmentEnabled" defaultChecked={driver?.assignmentEnabled ?? true} /><span><strong>Available for trip assignment</strong><small>Administrators can select this driver for new trips.</small></span></label>
      <div className="grid-2"><Field name="shiftStartTime" label="Shift starts (optional)" type="time" required={false} defaultValue={driver?.shiftStartTime || ""} /><Field name="shiftEndTime" label="Shift ends (optional)" type="time" required={false} defaultValue={driver?.shiftEndTime || ""} /></div>
      <p className="trip-meta">Leave both shift fields empty for no restriction. Overnight shifts such as 22:00–06:00 are supported.</p>
      <Field name="timeZone" label="Timezone" list="time-zones" defaultValue={driver?.timeZone || defaultTimeZone} /><datalist id="time-zones"><option value="Asia/Kolkata" /><option value="Asia/Dubai" /><option value="Europe/London" /><option value="America/New_York" /></datalist>
      <div className="grid-2"><Field name="dutyHours" label="Daily duty hours" type="number" min={0} max={24} defaultValue={Math.floor(duty / 60)} /><Field name="dutyMinutes" label="Additional minutes" type="number" min={0} max={59} defaultValue={duty % 60} /></div>
      <p className="trip-meta">{formatDuty(duty)} per day (1 minute to 24 hours).</p>
    </fieldset>
    {driver && <LeavePeriods driver={driver} />}
    <div className="dialog-actions"><button type="button" className="button button-secondary" disabled={busy} onClick={onCancel}>Cancel</button><button className="button" disabled={busy}>{busy ? "Saving…" : driver ? "Save settings" : "Create driver"}</button></div>
  </form>;
}

function LeavePeriods({ driver }: { driver: AdminDriver }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const list = usePaginatedList<DriverLeave>(`/api/v1/admin/drivers/${driver.id}/leaves?${listQuery({ page, pageSize })}`);
  const [error, setError] = useState<FormError>(null);
  const [busy, setBusy] = useState(false);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [reason, setReason] = useState("");
  const [pendingDelete, setPendingDelete] = useState<DriverLeave | null>(null);
  useEffect(() => {
    if (!list.pagination) return;
    const lastPage = Math.max(1, totalPages(list.pagination.total, list.pagination.pageSize));
    if (page > lastPage) queueMicrotask(() => setPage(lastPage));
  }, [list.pagination, page]);

  async function add() {
    const starts = new Date(startsAt);
    const ends = new Date(endsAt);
    if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime()) || ends <= starts) { setError({ message: "Leave end must be after its start." }); return; }
    setBusy(true); setError(null);
    try {
      await apiRequest(`/api/v1/admin/drivers/${driver.id}/leaves`, { method: "POST", body: JSON.stringify({ startsAt: starts.toISOString(), endsAt: ends.toISOString(), reason: reason.trim() || undefined }) });
      setStartsAt(""); setEndsAt(""); setReason(""); await list.refetch();
    } catch (cause) { setError({ message: errorMessage(cause), requestId: cause instanceof ApiError ? cause.requestId : undefined }); }
    finally { setBusy(false); }
  }
  async function remove(leave: DriverLeave) {
    setBusy(true); setError(null);
    try {
      await apiRequest<void>(`/api/v1/admin/drivers/${driver.id}/leaves/${leave.id}`, { method: "DELETE" });
      setPendingDelete(null);
      const nextPage = pageAfterRemovingLastItem(page, list.items?.length ?? 0);
      if (nextPage !== page) setPage(nextPage);
      else await list.refetch();
    }
    catch (cause) { setError({ message: errorMessage(cause), requestId: cause instanceof ApiError ? cause.requestId : undefined }); }
    finally { setBusy(false); }
  }
  return <fieldset className="settings-group"><legend>Leave periods</legend>
    {(error || list.error) && <ErrorAlert message={(error || list.error)!.message} requestId={(error || list.error)!.requestId} />}
    {list.items === null && !list.error && <p role="status">Loading leave periods…</p>}
    {list.items?.length === 0 && !error && !list.error && <p className="trip-meta">No leave periods are recorded.</p>}
    {list.items && list.items.length > 0 && <div className="leave-list" aria-busy={list.loading}>{list.items.map((leave) => <div className="leave-item" key={leave.id}><div><StatusBadge label={leaveState(leave)} tone={leaveState(leave) === "Active" ? "warning" : "neutral"} /><strong>{formatDateTime(leave.startsAt, driver.timeZone)} – {formatDateTime(leave.endsAt, driver.timeZone)}</strong><small>{leave.reason || "No reason provided"}</small></div><button type="button" className="button button-secondary" disabled={busy} onClick={() => setPendingDelete(leave)}>Delete</button></div>)}</div>}
    {list.pagination && <PaginationControl {...list.pagination} page={page} loading={list.loading} onPageChange={(next) => setPage(Math.max(1, Math.min(next, Math.max(1, totalPages(list.pagination!.total, pageSize)))))} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />}
    <h3>Add leave</h3><div className="grid-2"><ControlledField name="leaveStartsAt" label="Leave starts" type="datetime-local" value={startsAt} onChange={setStartsAt} /><ControlledField name="leaveEndsAt" label="Leave ends" type="datetime-local" value={endsAt} onChange={setEndsAt} /></div><ControlledField name="leaveReason" label="Reason (optional)" value={reason} onChange={setReason} /><button type="button" className="button button-secondary" disabled={busy || !startsAt || !endsAt} onClick={add}>{busy ? "Saving…" : "Add leave period"}</button>
    {pendingDelete && <AlertDialog title="Delete this leave period?" confirmLabel="Delete leave" destructive busy={busy} onCancel={() => setPendingDelete(null)} onConfirm={() => void remove(pendingDelete)}><p>{formatDateTime(pendingDelete.startsAt, driver.timeZone)} – {formatDateTime(pendingDelete.endsAt, driver.timeZone)} will no longer block assignments.</p></AlertDialog>}
  </fieldset>;
}

function leaveState(leave: DriverLeave) {
  const now = Date.now();
  return Date.parse(leave.startsAt) > now ? "Upcoming" : Date.parse(leave.endsAt) <= now ? "Past" : "Active";
}
function formatDuty(minutes: number) {
  const hours = Math.floor(minutes / 60); const remaining = minutes % 60;
  return [hours ? `${hours} hour${hours === 1 ? "" : "s"}` : "", remaining ? `${remaining} minute${remaining === 1 ? "" : "s"}` : ""].filter(Boolean).join(" ") || "0 minutes";
}
function Field({ name, label, type = "text", required = true, ...rest }: { name:string; label:string; type?:string; required?:boolean; maxLength?:number; minLength?:number; min?:number; max?:number; defaultValue?:string|number; list?:string }) {
  return <div className="field"><label htmlFor={name}>{label}</label><input className="input" id={name} name={name} type={type} required={required} {...rest} /></div>;
}
function ControlledField({ name, label, type = "text", value, onChange }: { name:string; label:string; type?:string; value:string; onChange:(value:string)=>void }) {
  return <div className="field"><label htmlFor={name}>{label}</label><input className="input" id={name} type={type} value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}
