"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { LifecycleStatus, Vehicle } from "@/lib/contracts";
import { ApiError, apiRequest, errorMessage, errorPresentation, focusFirstInvalidField, getData, resolveFormFieldErrors, type ApiErrorPresentation, type NormalizedFieldError } from "@/lib/api";
import { listQuery, pageAfterRemovingLastItem, totalPages } from "@/lib/pagination";
import { lifecycleStatus } from "@/lib/status";
import { createVehiclePayload, updateVehiclePayload, validateVehicleForm, vehicleFields, type VehicleField, type VehicleFieldErrors } from "@/lib/vehicles";
import { EmptyState, ErrorAlert, FormErrorSummary, LoadingCards, StatusBadge } from "./ui";
import { Modal } from "./modal";
import { PaginationControl, useListSearchParams, usePaginatedList } from "./pagination";

const lifecycleValues: LifecycleStatus[] = ["ACTIVE", "DEACTIVATED", "ARCHIVED"];
type VehicleDialog = { mode: "create" } | { mode: "edit"; vehicle: Vehicle };

export function AdminVehicles() {
  const search = useListSearchParams();
  const requestedStatus = search.parameters.get("status") as LifecycleStatus | null;
  const status = requestedStatus && lifecycleValues.includes(requestedStatus) ? requestedStatus : "ACTIVE";
  const path = search.ready ? `/api/v1/admin/vehicles?${listQuery({ status, page: search.page, pageSize: search.pageSize })}` : null;
  const list = usePaginatedList<Vehicle>(path);
  const [dialog, setDialog] = useState<VehicleDialog | null>(null);
  const [busy, setBusy] = useState(false);
  const [mutationError, setMutationError] = useState<ApiErrorPresentation | null>(null);
  const [fieldErrors, setFieldErrors] = useState<VehicleFieldErrors>({});
  const [backendSummary, setBackendSummary] = useState<NormalizedFieldError[]>([]);

  useEffect(() => {
    if (!list.pagination) return;
    const lastPage = Math.max(1, totalPages(list.pagination.total, list.pagination.pageSize));
    if (search.page > lastPage) search.setPage(lastPage, lastPage);
  }, [list.pagination, search.page]); // eslint-disable-line react-hooks/exhaustive-deps

  function open(next: VehicleDialog) {
    setMutationError(null);
    setFieldErrors({});
    setBackendSummary([]);
    setDialog(next);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialog || busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const localErrors = validateVehicleForm(data);
    setMutationError(null);
    setBackendSummary([]);
    setFieldErrors(localErrors);
    const firstLocalField = vehicleFields.find((field) => localErrors[field]);
    if (firstLocalField) {
      const field = form.elements.namedItem(firstLocalField);
      if (field instanceof HTMLElement) field.focus();
      return;
    }
    const body = dialog.mode === "create" ? createVehiclePayload(data) : updateVehiclePayload(dialog.vehicle, data);
    if (dialog.mode === "edit" && !Object.keys(body).length) {
      setDialog(null);
      return;
    }
    setBusy(true);
    try {
      const requestPath = dialog.mode === "create" ? "/api/v1/admin/vehicles" : `/api/v1/admin/vehicles/${encodeURIComponent(dialog.vehicle.id)}`;
      await getData<Vehicle>(requestPath, { method: dialog.mode === "create" ? "POST" : "PATCH", body: JSON.stringify(body) });
      setDialog(null);
      await list.refetch();
    } catch (cause) {
      const resolved = resolveFormFieldErrors(cause, vehicleFields);
      const known = cause instanceof ApiError && cause.code === "VEHICLE_REGISTRATION_ALREADY_EXISTS"
        ? { registrationNumber: errorMessage(cause) }
        : {};
      setFieldErrors({ ...resolved.byField, ...known });
      setBackendSummary(resolved.summary);
      setMutationError(errorPresentation(cause));
      queueMicrotask(() => focusFirstInvalidField(form, {
        ...resolved,
        firstField: resolved.firstField || ("registrationNumber" in known ? "registrationNumber" : undefined),
      }));
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(vehicle: Vehicle, next: LifecycleStatus) {
    setBusy(true);
    setMutationError(null);
    try {
      await apiRequest(`/api/v1/admin/vehicles/${encodeURIComponent(vehicle.id)}/status`, { method: "PATCH", body: JSON.stringify({ status: next }) });
      const nextPage = pageAfterRemovingLastItem(search.page, list.items?.length ?? 0);
      if (nextPage !== search.page) search.setPage(nextPage);
      else await list.refetch();
    } catch (cause) {
      setMutationError(errorPresentation(cause));
    } finally {
      setBusy(false);
    }
  }

  const error = mutationError || list.error;
  return <>
    <div className="page-header"><div><p className="eyebrow">Fleet management</p><h1>Vehicles</h1><p>Maintain vehicle, owner, and payment details for the fleet used on trips.</p></div><button className="button" onClick={() => open({ mode: "create" })}>Add vehicle</button></div>
    <div className="toolbar"><div className="filters"><label className="field" style={{ margin: 0 }}><span className="sr-only">Filter by lifecycle</span><select className="select" value={status} onChange={(event) => search.update({ status: event.target.value }, true)}><option value="ACTIVE">Active</option><option value="DEACTIVATED">Deactivated</option><option value="ARCHIVED">Archived</option></select></label></div><button className="button button-secondary" disabled={list.loading} onClick={() => void list.refetch()}>Refresh</button></div>
    {error && <ErrorAlert {...error} />}
    {list.items === null && !list.error && <LoadingCards />}
    {list.items?.length === 0 && !error && <EmptyState title={`No ${status.toLowerCase()} vehicles`}>Create the first vehicle or choose another lifecycle filter.</EmptyState>}
    {list.items && list.items.length > 0 && <section className="card data-list" aria-busy={list.loading} aria-label="Vehicle fleet"><div className="data-row data-head vehicle-row"><span>Display name</span><span>Registration number</span><span>Vehicle type</span><span>Registered owner</span><span>Status</span><span>Actions</span></div>{list.items.map((vehicle) => {
      const state = lifecycleStatus[vehicle.status];
      return <div className="data-row vehicle-row" key={vehicle.id}>
        <span data-label="Display name"><strong>{vehicle.displayName}</strong></span>
        <span data-label="Registration number">{vehicle.registrationNumber}</span>
        <span data-label="Vehicle type">{vehicle.vehicleType}</span>
        <span data-label="Registered owner">{vehicle.registeredOwner || <small>Not provided</small>}</span>
        <span data-label="Status"><StatusBadge label={state.label} tone={state.tone} /></span>
        <span className="trip-actions" data-label="Actions">{vehicle.status !== "ARCHIVED" && <button className="button button-secondary" disabled={busy} onClick={() => open({ mode: "edit", vehicle })}>Edit</button>}{vehicle.status === "ACTIVE" ? <button className="button button-secondary" disabled={busy} onClick={() => void changeStatus(vehicle, "DEACTIVATED")}>Deactivate</button> : vehicle.status === "DEACTIVATED" ? <><button className="button button-secondary" disabled={busy} onClick={() => void changeStatus(vehicle, "ACTIVE")}>Activate</button><button className="button button-secondary" disabled={busy} onClick={() => void changeStatus(vehicle, "ARCHIVED")}>Archive</button></> : <span className="trip-meta">Read-only history</span>}</span>
      </div>;
    })}</section>}
    {list.pagination && <PaginationControl {...list.pagination} page={search.page} loading={list.loading} onPageChange={(page) => search.setPage(page, totalPages(list.pagination!.total, list.pagination!.pageSize))} onPageSizeChange={search.setPageSize} />}
    {dialog && <Modal onDismiss={() => !busy && setDialog(null)}><VehicleForm dialog={dialog} busy={busy} error={mutationError} fieldErrors={fieldErrors} backendSummary={backendSummary} onSubmit={save} onCancel={() => setDialog(null)} /></Modal>}
  </>;
}

function VehicleForm({ dialog, busy, error, fieldErrors, backendSummary, onSubmit, onCancel }: { dialog: VehicleDialog; busy: boolean; error: ApiErrorPresentation | null; fieldErrors: VehicleFieldErrors; backendSummary: NormalizedFieldError[]; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onCancel: () => void }) {
  const vehicle = dialog.mode === "edit" ? dialog.vehicle : null;
  return <form className="dialog dialog-wide vehicle-form" role="dialog" aria-modal="true" aria-labelledby="vehicle-dialog-title" onSubmit={onSubmit} noValidate>
    <span className="eyebrow">{vehicle ? "Edit fleet record" : "New fleet record"}</span><h2 id="vehicle-dialog-title">{vehicle ? `Edit ${vehicle.displayName}` : "Add vehicle"}</h2>
    {error && <ErrorAlert {...error} />}
    <FormErrorSummary errors={backendSummary} />
    <fieldset className="vehicle-form-section"><legend>Vehicle details</legend>
      <VehicleField name="displayName" label="Vehicle display name" maxLength={200} defaultValue={vehicle?.displayName || ""} error={fieldErrors.displayName} />
      <VehicleField name="registrationNumber" label="Registration number" maxLength={64} defaultValue={vehicle?.registrationNumber || ""} error={fieldErrors.registrationNumber} />
      <VehicleField name="vehicleType" label="Vehicle type" maxLength={100} defaultValue={vehicle?.vehicleType || ""} error={fieldErrors.vehicleType} />
    </fieldset>
    <fieldset className="vehicle-form-section"><legend>Owner details</legend><p>Owner information is optional and can be added or cleared later.</p>
      <VehicleField name="registeredOwner" label="Registered owner" maxLength={200} required={false} defaultValue={vehicle?.registeredOwner || ""} error={fieldErrors.registeredOwner} />
      <VehicleField name="address" label="Owner address" maxLength={2000} required={false} multiline defaultValue={vehicle?.address || ""} error={fieldErrors.address} />
      <VehicleField name="contactNumber" label="Contact number" maxLength={64} required={false} defaultValue={vehicle?.contactNumber || ""} error={fieldErrors.contactNumber} />
    </fieldset>
    <fieldset className="vehicle-form-section"><legend>Bank details</legend><p>Bank information is optional. Account numbers are stored exactly as entered, including leading zeroes.</p>
      <VehicleField name="accountNumber" label="Account number" maxLength={128} required={false} defaultValue={vehicle?.accountNumber || ""} error={fieldErrors.accountNumber} />
      <VehicleField name="ifscCode" label="IFSC code" maxLength={32} required={false} defaultValue={vehicle?.ifscCode || ""} error={fieldErrors.ifscCode} />
      <VehicleField name="bankName" label="Bank name" maxLength={200} required={false} defaultValue={vehicle?.bankName || ""} error={fieldErrors.bankName} />
    </fieldset>
    <div className="dialog-actions"><button type="button" className="button button-secondary" disabled={busy} onClick={onCancel}>Cancel</button><button className="button" disabled={busy}>{busy ? "Saving…" : vehicle ? "Save changed fields" : "Create vehicle"}</button></div>
  </form>;
}

function VehicleField({ name, label, error, required = true, multiline = false, ...props }: { name: VehicleField; label: string; error?: string; required?: boolean; multiline?: boolean; defaultValue: string; maxLength: number }) {
  const errorId = `${name}-error`;
  const common = { id: name, name, required, "aria-invalid": Boolean(error), "aria-describedby": error ? errorId : undefined, ...props };
  return <div className="field"><label htmlFor={name}>{label}{!required && " (optional)"}</label>{multiline ? <textarea className="textarea" {...common} /> : <input className="input" type="text" {...common} />}{error && <small className="field-error" id={errorId}>{error}</small>}</div>;
}
