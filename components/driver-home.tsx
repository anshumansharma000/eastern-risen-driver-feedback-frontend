"use client";

import { useEffect } from "react";
import type { Trip } from "@/lib/contracts";
import { listQuery, totalPages } from "@/lib/pagination";
import { EmptyState, ErrorAlert, LoadingCards } from "./ui";
import { TripCard } from "./trip-card";
import { PaginationControl, useListSearchParams, usePaginatedList } from "./pagination";

export function DriverHome() {
  const search = useListSearchParams();
  const list = usePaginatedList<Trip>(
    search.ready ? `/api/v1/driver/trips?${listQuery({ status: "READY", page: search.page, pageSize: search.pageSize })}` : null,
  );

  useEffect(() => {
    if (!list.pagination) return;
    const lastPage = Math.max(1, totalPages(list.pagination.total, list.pagination.pageSize));
    if (search.page > lastPage) search.setPage(lastPage, lastPage);
  }, [list.pagination, search.page]); // eslint-disable-line react-hooks/exhaustive-deps

  return <>
    <div className="page-header"><div><p className="eyebrow">Ready journeys</p><h1>Today’s handoffs</h1><p>Confirm the correct trip before giving the device to a passenger.</p></div></div>
    <div className="grid-2" style={{ marginBottom: "1.5rem" }}><div className="card stat"><span>Ready now</span><strong>{list.pagination?.total ?? "—"}</strong><small>Assigned to your account</small></div><div className="card stat"><span>Waiting to sync</span><strong>—</strong><small>Stored only on this device</small></div></div>
    {list.error && <><ErrorAlert message={list.error.message} requestId={list.error.requestId} /><button className="button button-secondary" onClick={() => void list.refetch()}>Try again</button></>}
    {list.items === null && !list.error && <LoadingCards />}
    {list.items?.length === 0 && !list.error && <EmptyState title="No trips are ready">Trips assigned to you and ready for feedback will appear here.</EmptyState>}
    {list.items && list.items.length > 0 && <div className="trip-list" aria-busy={list.loading}>{list.items.map((trip) => <TripCard key={trip.id} trip={trip} />)}</div>}
    {list.pagination && <PaginationControl {...list.pagination} page={search.page} loading={list.loading} onPageChange={(page) => search.setPage(page, totalPages(list.pagination!.total, list.pagination!.pageSize))} onPageSizeChange={search.setPageSize} />}
  </>;
}
