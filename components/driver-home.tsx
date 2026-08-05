"use client";

import type { Trip } from "@/lib/contracts";
import { listQuery } from "@/lib/pagination";
import { EmptyState, ErrorAlert, LoadingCards } from "./ui";
import { TripCard } from "./trip-card";
import { usePaginatedList } from "./pagination";

export function DriverHome() {
  const ready = usePaginatedList<Trip>(`/api/v1/driver/trips?${listQuery({ status:"READY", page:1, pageSize:100 })}`);
  const started = usePaginatedList<Trip>(`/api/v1/driver/trips?${listQuery({ status:"FEEDBACK_STARTED", page:1, pageSize:100 })}`);
  const trips = ready.items && started.items ? [...ready.items, ...started.items].sort((a,b)=>a.scheduledAt.localeCompare(b.scheduledAt)) : null;
  const error = ready.error || started.error;
  const loading = ready.loading || started.loading;
  const retry = () => Promise.all([ready.refetch(), started.refetch()]);

  return <>
    <div className="page-header"><div><p className="eyebrow">Assigned journeys</p><h1>Today’s handoffs</h1><p>Ready trips and feedback already in progress remain here until the passenger submits.</p></div></div>
    <div className="grid-2" style={{ marginBottom: "1.5rem" }}><div className="card stat"><span>Ready now</span><strong>{ready.pagination?.total ?? "—"}</strong><small>Assigned to your account</small></div><div className="card stat"><span>Feedback started</span><strong>{started.pagination?.total ?? "—"}</strong><small>Waiting for passenger submission</small></div></div>
    {error && <><ErrorAlert message={error.message} requestId={error.requestId} /><button className="button button-secondary" onClick={() => void retry()}>Try again</button></>}
    {trips === null && !error && <LoadingCards />}
    {trips?.length === 0 && !error && <EmptyState title="No active journeys">Ready trips and feedback in progress will appear here.</EmptyState>}
    {trips && trips.length > 0 && <div className="trip-list" aria-busy={loading}>{trips.map((trip) => <TripCard key={trip.id} trip={trip} />)}</div>}
  </>;
}
