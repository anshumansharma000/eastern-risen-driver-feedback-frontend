"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { LifecycleStatus, Vehicle, Vendor } from "@/lib/contracts";
import { ApiError, apiRequest, errorMessage } from "@/lib/api";
import { listQuery, pageAfterRemovingLastItem, totalPages } from "@/lib/pagination";
import { lifecycleStatus } from "@/lib/status";
import { EmptyState, ErrorAlert, LoadingCards, StatusBadge } from "./ui";
import { Modal } from "./modal";
import { PaginationControl, useListSearchParams, usePaginatedList } from "./pagination";
import { AdminDrivers } from "./admin-drivers";

type Resource = "vendors" | "vehicles" | "drivers";
type DirectoryResource = Exclude<Resource, "drivers">;
type Item = Vendor | Vehicle;
const titles = {
  vendors: ["Vendors", "Manage the companies that supply outsourced drivers."],
  vehicles: ["Vehicles", "Maintain the active fleet used when trips are created."],
} as const;
const lifecycleValues: LifecycleStatus[] = ["ACTIVE", "DEACTIVATED", "ARCHIVED"];

function primary(item: Item) { return "name" in item ? item.name : item.displayName; }
function secondary(item: Item) { return "contactName" in item ? (item.contactName || item.contactEmail || "No contact details") : item.registrationNumber; }

export function AdminResources({ resource }: { resource: Resource }) {
  return resource === "drivers" ? <AdminDrivers /> : <ResourceDirectory resource={resource} />;
}

function ResourceDirectory({ resource }: { resource: DirectoryResource }) {
  const search = useListSearchParams();
  const requestedStatus = search.parameters.get("status") as LifecycleStatus | null;
  const status = requestedStatus && lifecycleValues.includes(requestedStatus) ? requestedStatus : "ACTIVE";
  const path = search.ready
    ? `/api/v1/admin/${resource}?${listQuery({ status, page: search.page, pageSize: search.pageSize })}`
    : null;
  const list = usePaginatedList<Item>(path);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mutationError, setMutationError] = useState<{ message: string; requestId?: string } | null>(null);

  useEffect(() => {
    if (!list.pagination) return;
    const lastPage = Math.max(1, totalPages(list.pagination.total, list.pagination.pageSize));
    if (search.page > lastPage) search.setPage(lastPage, lastPage);
  }, [list.pagination, search.page]); // eslint-disable-line react-hooks/exhaustive-deps

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setMutationError(null);
    const data = new FormData(event.currentTarget);
    const body = resource === "vendors"
      ? { name: data.get("name"), contactName: data.get("contactName") || undefined, contactEmail: data.get("contactEmail") || undefined, contactPhone: data.get("contactPhone") || undefined }
      : { displayName: data.get("displayName"), registrationNumber: data.get("registrationNumber") };
    try {
      await apiRequest(`/api/v1/admin/${resource}`, { method: "POST", body: JSON.stringify(body) });
      setShowForm(false);
      await list.refetch();
    } catch (cause) {
      setMutationError({ message: errorMessage(cause), requestId: cause instanceof ApiError ? cause.requestId : undefined });
    } finally { setBusy(false); }
  }

  async function changeStatus(item: Item, next: LifecycleStatus) {
    setBusy(true); setMutationError(null);
    try {
      await apiRequest(`/api/v1/admin/${resource}/${item.id}/status`, { method: "PATCH", body: JSON.stringify({ status: next }) });
      const nextPage = pageAfterRemovingLastItem(search.page, list.items?.length ?? 0);
      if (nextPage !== search.page) search.setPage(nextPage);
      else await list.refetch();
    } catch (cause) {
      setMutationError({ message: errorMessage(cause), requestId: cause instanceof ApiError ? cause.requestId : undefined });
    } finally { setBusy(false); }
  }

  const [title, copy] = titles[resource];
  const error = mutationError || list.error;
  return <>
    <div className="page-header"><div><p className="eyebrow">Operations directory</p><h1>{title}</h1><p>{copy}</p></div><button className="button" onClick={() => setShowForm(true)}>Add {resource.slice(0, -1)}</button></div>
    <div className="toolbar"><div className="filters"><label className="field" style={{ margin: 0 }}><span className="sr-only">Filter by lifecycle</span><select className="select" value={status} onChange={(event) => search.update({ status: event.target.value }, true)}><option value="ACTIVE">Active</option><option value="DEACTIVATED">Deactivated</option><option value="ARCHIVED">Archived</option></select></label></div><button className="button button-secondary" disabled={list.loading} onClick={() => void list.refetch()}>Refresh</button></div>
    {error && <ErrorAlert message={error.message} requestId={error.requestId} />}
    {list.items === null && !list.error && <LoadingCards />}
    {list.items?.length === 0 && !error && <EmptyState title={`No ${status.toLowerCase()} ${resource}`}>Create the first record or choose another lifecycle filter.</EmptyState>}
    {list.items && list.items.length > 0 && <section className="card data-list" aria-busy={list.loading}><div className="data-row data-head"><span>Name</span><span>Details</span><span>Status</span><span>Actions</span></div>{list.items.map((item) => {
      const state = lifecycleStatus[item.status];
      return <div className="data-row" key={item.id}><span><strong>{primary(item)}</strong><small>{"contactEmail" in item ? item.contactEmail : "Fleet record"}</small></span><span>{secondary(item)}</span><StatusBadge label={state.label} tone={state.tone} /><span>{item.status === "ACTIVE" ? <button className="button button-secondary" disabled={busy} onClick={() => void changeStatus(item, "DEACTIVATED")}>Deactivate</button> : item.status === "DEACTIVATED" ? <><button className="button button-secondary" disabled={busy} onClick={() => void changeStatus(item, "ACTIVE")}>Activate</button> <button className="button button-secondary" disabled={busy} onClick={() => void changeStatus(item, "ARCHIVED")}>Archive</button></> : <span className="trip-meta">Read-only history</span>}</span></div>;
    })}</section>}
    {list.pagination && <PaginationControl {...list.pagination} page={search.page} loading={list.loading} onPageChange={(page) => search.setPage(page, totalPages(list.pagination!.total, list.pagination!.pageSize))} onPageSizeChange={search.setPageSize} />}
    {showForm && <Modal onDismiss={() => setShowForm(false)}><form className="dialog" role="dialog" aria-modal="true" onSubmit={create}><span className="eyebrow">New {resource.slice(0, -1)}</span><h2>Add to operations</h2>{resource === "vendors" ? <><Field name="name" label="Vendor name" maxLength={200} /><Field name="contactName" label="Contact name" maxLength={200} required={false} /><Field name="contactEmail" label="Contact email" type="email" maxLength={320} required={false} /><Field name="contactPhone" label="Contact phone" maxLength={32} required={false} /></> : <><Field name="displayName" label="Vehicle display name" maxLength={200} /><Field name="registrationNumber" label="Registration number" maxLength={64} /></>}<div className="dialog-actions"><button type="button" className="button button-secondary" onClick={() => setShowForm(false)}>Cancel</button><button className="button" disabled={busy}>{busy ? "Saving…" : "Create record"}</button></div></form></Modal>}
  </>;
}

function Field({ name, label, type = "text", required = true, ...rest }: { name: string; label: string; type?: string; required?: boolean; maxLength?: number; minLength?: number }) {
  return <div className="field"><label htmlFor={name}>{label}{!required && " (optional)"}</label><input className="input" id={name} name={name} type={type} required={required} {...rest} /></div>;
}
