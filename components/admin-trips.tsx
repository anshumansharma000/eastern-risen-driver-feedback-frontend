"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { AdminDriver, Trip, TripCreationSource, TripStatus, Vehicle } from "@/lib/contracts";
import { ApiError, apiRequest, errorMessage, getPaginated } from "@/lib/api";
import { formatTripRange, tripSource, tripStatus } from "@/lib/status";
import { assignmentErrorFields, changedTripFields, validateTripSchedule, type TripFieldName, type TripScheduleInput, type TripValidationErrors } from "@/lib/trip-scheduling";
import { listQuery, pageAfterRemovingLastItem, totalPages } from "@/lib/pagination";
import { EmptyState, ErrorAlert, LoadingCards, StatusBadge } from "./ui";
import { Modal } from "./modal";
import { PaginationControl, useListSearchParams, usePaginatedList } from "./pagination";
import { Combobox, type ComboboxOption } from "./combobox";
import { AlertDialog } from "./alert-dialog";

type TripDialog = { mode: "create" } | { mode: "edit"; trip: Trip };
type TripFormValues = TripScheduleInput & { driverId: string };

function toDateTimeLocal(isoDate: string) {
  const date = new Date(isoDate);
  const localTime = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localTime.toISOString().slice(0, 16);
}

function localValueToIso(value: FormDataEntryValue | null) {
  if (!value) return "";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function focusTripField(form: HTMLFormElement, field: TripFieldName) {
  (form.querySelector<HTMLElement>(`#${field}`) || form.elements.namedItem(field) as HTMLElement | null)?.focus();
}

export function tripValuesFromForm(form: HTMLFormElement): TripFormValues {
  const data = new FormData(form);
  return {
    bookingReference: String(data.get("bookingReference") || "").trim(),
    passengerName: String(data.get("passengerName") || "").trim(),
    pickupLocation: String(data.get("pickupLocation") || "").trim(),
    destination: String(data.get("destination") || "").trim(),
    scheduledAt: localValueToIso(data.get("scheduledAt")),
    scheduledEndAt: localValueToIso(data.get("scheduledEndAt")),
    vehicleId: String(data.get("vehicleId") || ""),
    driverId: String(data.get("driverId") || ""),
  };
}

export function changedTripValues(trip: Trip, values: TripFormValues) {
  return changedTripFields({ ...trip, vehicleId: trip.vehicle.id, driverId: trip.driver.id }, values);
}

export function AdminTrips() {
  const search = useListSearchParams();
  const [drivers, setDrivers] = useState<AdminDriver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const statusValues: TripStatus[] = ["READY", "FEEDBACK_STARTED", "SUBMITTED", "ARCHIVED"];
  const sourceValues: TripCreationSource[] = ["ADMIN_ASSIGNED", "DRIVER_ENTERED"];
  const statusParam = search.parameters.get("status") as TripStatus | null;
  const sourceParam = search.parameters.get("creationSource") as TripCreationSource | null;
  const status = statusParam && statusValues.includes(statusParam) ? statusParam : "READY";
  const creationSource = sourceParam && sourceValues.includes(sourceParam) ? sourceParam : null;
  const driverId = search.parameters.get("driverId");
  const path = search.ready ? `/api/v1/admin/trips?${listQuery({ status, driverId, creationSource, page: search.page, pageSize: search.pageSize })}` : null;
  const list = usePaginatedList<Trip>(path);
  const [dialog, setDialog] = useState<TripDialog | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [dialogError, setDialogError] = useState<{ message: string; requestId?: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<TripValidationErrors>({});
  const [pendingArchive, setPendingArchive] = useState<Trip | null>(null);

  const loadOptions = useCallback(async () => {
    setError(null);
    try {
      const [driverList, vehicleList] = await Promise.all([
        getPaginated<AdminDriver>("/api/v1/admin/drivers?status=ACTIVE&page=1&pageSize=100"),
        getPaginated<Vehicle>("/api/v1/admin/vehicles?status=ACTIVE&page=1&pageSize=100"),
      ]);
      setDrivers(driverList.data); setVehicles(vehicleList.data);
    } catch (cause) {
      setError({ message: errorMessage(cause), requestId: cause instanceof ApiError ? cause.requestId : undefined });
    }
  }, []);

  useEffect(() => { queueMicrotask(() => void loadOptions()); }, [loadOptions]);
  useEffect(() => {
    if (!list.pagination) return;
    const lastPage = Math.max(1, totalPages(list.pagination.total, list.pagination.pageSize));
    if (search.page > lastPage) search.setPage(lastPage, lastPage);
  }, [list.pagination, search.page]); // eslint-disable-line react-hooks/exhaustive-deps

  function openDialog(next: TripDialog) {
    setDialogError(null); setFieldErrors({}); setDialog(next);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialog || busy) return;
    const form = event.currentTarget;
    const values = tripValuesFromForm(form);
    const validation = validateTripSchedule(values);
    setFieldErrors(validation);
    const firstInvalid = Object.keys(validation)[0] as TripFieldName | undefined;
    if (firstInvalid) {
      focusTripField(form, firstInvalid);
      setDialogError({ message: Object.values(validation)[0] || "Review the highlighted fields." });
      return;
    }
    setBusy(true); setDialogError(null);
    try {
      if (dialog.mode === "create") {
        await apiRequest("/api/v1/admin/trips", { method: "POST", body: JSON.stringify(values) });
      } else {
        const patch = changedTripValues(dialog.trip, values);
        if (Object.keys(patch).length === 0) { setDialog(null); return; }
        await apiRequest(`/api/v1/admin/trips/${dialog.trip.id}`, { method: "PATCH", body: JSON.stringify(patch) });
      }
      setDialog(null); await list.refetch();
    } catch (cause) {
      const message = errorMessage(cause);
      setDialogError({ message, requestId: cause instanceof ApiError ? cause.requestId : undefined });
      if (cause instanceof ApiError) {
        const fields = assignmentErrorFields[cause.code] || [];
        setFieldErrors(Object.fromEntries(fields.map((field) => [field, message])));
        if (fields[0]) focusTripField(form, fields[0]);
      }
    } finally { setBusy(false); }
  }

  async function archive(id: string) {
    setBusy(true);
    try {
      await apiRequest(`/api/v1/admin/trips/${id}/archive`, { method: "POST" });
      setPendingArchive(null);
      const nextPage = pageAfterRemovingLastItem(search.page, list.items?.length ?? 0);
      if (nextPage !== search.page) search.setPage(nextPage);
      else await list.refetch();
    }
    catch (cause) { setError({ message: errorMessage(cause), requestId: cause instanceof ApiError ? cause.requestId : undefined }); }
    finally { setBusy(false); }
  }

  return <>
    <div className="page-header"><div><p className="eyebrow">Journey operations</p><h1>Trips</h1><p>Create and assign trips using active drivers and vehicles. Times are shown in India Standard Time.</p></div><button className="button" onClick={() => openDialog({ mode: "create" })}>Create assigned trip</button></div>
    <div className="toolbar"><div className="filters"><select className="select" value={status} onChange={(event) => search.update({ status: event.target.value }, true)} aria-label="Filter trip status"><option value="READY">Ready for feedback</option><option value="FEEDBACK_STARTED">Feedback started</option><option value="SUBMITTED">Feedback received</option><option value="ARCHIVED">Archived</option></select><select className="select" value={driverId || ""} onChange={(event) => search.update({ driverId: event.target.value || null }, true)} aria-label="Filter by driver"><option value="">All drivers</option>{drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.displayName}</option>)}</select><select className="select" value={creationSource || ""} onChange={(event) => search.update({ creationSource: event.target.value || null }, true)} aria-label="Filter by creation source"><option value="">All creation sources</option><option value="ADMIN_ASSIGNED">Admin assigned</option><option value="DRIVER_ENTERED">Driver entered</option></select></div><button className="button button-secondary" disabled={list.loading} onClick={() => void list.refetch()}>Refresh</button></div>
    {(error || list.error) && <ErrorAlert message={(error || list.error)!.message} requestId={(error || list.error)!.requestId} />}
    {list.items === null && !list.error && <LoadingCards />}
    {list.items?.length === 0 && !error && !list.error && <EmptyState title="No trips match this view">Create a journey or choose another feedback status.</EmptyState>}
    {list.items && list.items.length > 0 && <section className="trip-list" aria-busy={list.loading}>{list.items.map((trip) => {
      const state = tripStatus[trip.status];
      return <article className="card trip-card" key={trip.id}><div className="trip-card-head"><div><span className="eyebrow">{tripSource[trip.creationSource]}</span><h3>{trip.bookingReference}</h3><span className="trip-meta">{formatTripRange(trip.scheduledAt, trip.scheduledEndAt)} · {trip.driver.displayName} · {trip.vehicle.displayName}</span></div><StatusBadge label={state.label} tone={state.tone} /></div><div className="route"><div className="route-line"><i className="route-dot" /><i className="route-dot" /></div><div className="route-points"><span><small>Pickup</small>{trip.pickupLocation}</span><span><small>Destination</small>{trip.destination}</span></div></div>{trip.status !== "ARCHIVED" && <div className="trip-actions">{trip.status === "READY" && <button className="button button-secondary" disabled={busy} onClick={() => openDialog({ mode: "edit", trip })}>Edit trip</button>}<button className="button button-secondary" disabled={busy} onClick={() => setPendingArchive(trip)}>Archive trip</button></div>}</article>;
    })}</section>}
    {list.pagination && <PaginationControl {...list.pagination} page={search.page} loading={list.loading} onPageChange={(page) => search.setPage(page, totalPages(list.pagination!.total, list.pagination!.pageSize))} onPageSizeChange={search.setPageSize} />}
    {dialog && <Modal onDismiss={() => !busy && setDialog(null)}><TripForm mode={dialog.mode} trip={dialog.mode === "edit" ? dialog.trip : undefined} drivers={drivers} vehicles={vehicles} busy={busy} error={dialogError} fieldErrors={fieldErrors} onCancel={() => setDialog(null)} onSubmit={submit} /></Modal>}
    {pendingArchive && <AlertDialog title={`Archive trip ${pendingArchive.bookingReference}?`} confirmLabel="Archive trip" destructive busy={busy} onCancel={() => setPendingArchive(null)} onConfirm={() => void archive(pendingArchive.id)}><p>The trip will leave active views but remain available in historical records.</p></AlertDialog>}
  </>;
}

function TripForm({ mode, trip, drivers, vehicles, busy, error, fieldErrors, onCancel, onSubmit }: {
  mode: "create" | "edit"; trip?: Trip; drivers: AdminDriver[]; vehicles: Vehicle[]; busy: boolean;
  error: { message: string; requestId?: string } | null; fieldErrors: TripValidationErrors;
  onCancel: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const driverAvailable = !trip || drivers.some((driver) => driver.id === trip.driver.id);
  const vehicleAvailable = !trip || vehicles.some((vehicle) => vehicle.id === trip.vehicle.id);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headingRef.current?.focus(); }, []);
  const driverOptions: ComboboxOption[] = drivers.map((driver) => ({
    value: driver.id,
    label: driver.displayName,
    description: `${driver.driverCode} · ${driver.sourceType === "OUTSOURCED" ? driver.vendorName || "Outsourced" : "Agency driver"}${!driver.assignmentEnabled ? " · unavailable for assignment" : ""}`,
    keywords: `${driver.driverCode} ${driver.vendorName || ""}`,
    disabled: !driver.assignmentEnabled && driver.id !== trip?.driver.id,
  }));
  if (trip && !driverAvailable) {
    driverOptions.unshift({ value: trip.driver.id, label: trip.driver.displayName, description: `${trip.driver.driverCode} · current assignment` });
  }
  const vehicleOptions: ComboboxOption[] = vehicles.map((vehicle) => ({
    value: vehicle.id,
    label: vehicle.displayName,
    description: vehicle.registrationNumber,
    keywords: vehicle.registrationNumber,
  }));
  if (trip && !vehicleAvailable) {
    vehicleOptions.unshift({ value: trip.vehicle.id, label: trip.vehicle.displayName, description: `${trip.vehicle.registrationNumber} · current vehicle` });
  }
  return <form className="dialog" onSubmit={onSubmit} role="dialog" aria-modal="true">
    <span className="eyebrow">{mode === "edit" ? "Ready trip" : "Admin-assigned"}</span><h2 ref={headingRef} tabIndex={-1}>{mode === "edit" ? "Edit trip" : "Create a trip"}</h2>
    <p className="trip-meta">Enter times in this device’s timezone ({deviceTimeZone()}). Trip lists are displayed in India Standard Time.</p>
    {error && <ErrorAlert message={error.message} requestId={error.requestId} />}
    <TripField name="bookingReference" label="Booking reference" maxLength={100} defaultValue={trip?.bookingReference} error={fieldErrors.bookingReference} />
    <TripField name="passengerName" label="Passenger name" maxLength={200} defaultValue={trip?.passengerName} />
    <TripField name="pickupLocation" label="Pickup location" maxLength={500} defaultValue={trip?.pickupLocation} error={fieldErrors.pickupLocation} />
    <TripField name="destination" label="Destination" maxLength={500} defaultValue={trip?.destination} error={fieldErrors.destination} />
    <ScheduleFields trip={trip} fieldErrors={fieldErrors} />
    <Combobox id="driverId" name="driverId" label="Active driver" options={driverOptions} defaultValue={trip?.driver.id} placeholder="Search by driver name or code" emptyMessage="No drivers match that search" error={fieldErrors.driverId} hint="Searches the active drivers currently loaded." required />
    <Combobox id="vehicleId" name="vehicleId" label="Active vehicle" options={vehicleOptions} defaultValue={trip?.vehicle.id} placeholder="Search by vehicle name or registration" emptyMessage="No vehicles match that search" error={fieldErrors.vehicleId} hint="Searches the active vehicles currently loaded." required />
    <div className="dialog-actions"><button type="button" className="button button-secondary" disabled={busy} onClick={onCancel}>Cancel</button><button className="button" disabled={busy}>{busy ? "Saving…" : mode === "edit" ? "Save changes" : "Create trip"}</button></div>
  </form>;
}

function defaultStartValue() {
  const date = new Date();
  date.setSeconds(0, 0);
  const minutes = date.getMinutes();
  date.setMinutes(minutes < 30 ? 30 : 60);
  return toDateTimeLocal(date.toISOString());
}

function addMinutesToLocal(value: string, minutes: number) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  date.setMinutes(date.getMinutes() + minutes);
  return toDateTimeLocal(date.toISOString());
}

function deviceTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "device local time";
}

function ScheduleFields({ trip, fieldErrors }: { trip?: Trip; fieldErrors: TripValidationErrors }) {
  const initialStart = trip ? toDateTimeLocal(trip.scheduledAt) : defaultStartValue();
  const [startsAt, setStartsAt] = useState(initialStart);
  const [endsAt, setEndsAt] = useState(trip ? toDateTimeLocal(trip.scheduledEndAt) : addMinutesToLocal(initialStart, 120));

  function changeStart(next: string) {
    const previousSuggestedEnd = addMinutesToLocal(startsAt, 120);
    setStartsAt(next);
    if (!endsAt || endsAt === previousSuggestedEnd) setEndsAt(addMinutesToLocal(next, 120));
  }

  return <>
    <div className="grid-2">
      <ControlledTripField name="scheduledAt" label="Trip starts" type="datetime-local" value={startsAt} onChange={changeStart} error={fieldErrors.scheduledAt} />
      <ControlledTripField name="scheduledEndAt" label="Trip ends" type="datetime-local" value={endsAt} onChange={setEndsAt} error={fieldErrors.scheduledEndAt} />
    </div>
    <div className="duration-shortcuts" aria-label="Set trip duration">
      <span>Set duration:</span>
      {[60, 120, 240].map((minutes) => <button key={minutes} className="button button-secondary" type="button" onClick={() => setEndsAt(addMinutesToLocal(startsAt, minutes))}>+{minutes / 60}h</button>)}
    </div>
  </>;
}

function ControlledTripField({ name, label, type, value, onChange, error }: { name: TripFieldName; label: string; type: string; value: string; onChange: (value: string) => void; error?: string }) {
  return <div className="field"><label htmlFor={name}>{label}</label><input className="input" id={name} name={name} type={type} value={value} onChange={(event) => onChange(event.target.value)} required aria-invalid={!!error} aria-describedby={error ? `${name}-error` : undefined} />{error && <small className="field-error" id={`${name}-error`}>{error}</small>}</div>;
}

function TripField({ name, label, type = "text", maxLength, defaultValue, error }: { name: TripFieldName; label: string; type?: string; maxLength?: number; defaultValue?: string; error?: string }) {
  return <div className="field"><label htmlFor={name}>{label}</label><input className="input" id={name} name={name} type={type} maxLength={maxLength} defaultValue={defaultValue} required aria-invalid={!!error} aria-describedby={error ? `${name}-error` : undefined} />{error && <small className="field-error" id={`${name}-error`}>{error}</small>}</div>;
}
