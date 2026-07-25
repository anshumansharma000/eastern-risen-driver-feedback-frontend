"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PaginatedResponse } from "@/lib/contracts";
import { ApiError, errorMessage, getPaginated } from "@/lib/api";
import { boundedPage, DEFAULT_PAGE, DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS, positiveInteger, totalPages, updateListSearch } from "@/lib/pagination";

type ListError = { message: string; requestId?: string } | null;

export function useListSearchParams(defaultPageSize = DEFAULT_PAGE_SIZE) {
  const [search, setSearch] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => setSearch(window.location.search);
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      sync();
      setReady(true);
    });
    window.addEventListener("popstate", sync);
    return () => {
      active = false;
      window.removeEventListener("popstate", sync);
    };
  }, []);

  const parameters = new URLSearchParams(search);
  const page = positiveInteger(parameters.get("page"), DEFAULT_PAGE);
  const pageSize = positiveInteger(parameters.get("pageSize"), defaultPageSize, 100);

  const update = useCallback((changes: Record<string, string | number | null | undefined>, resetPage = false) => {
    const next = updateListSearch(window.location.search, changes, resetPage);
    const query = next.toString();
    window.history.pushState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
    setSearch(query ? `?${query}` : "");
  }, []);

  return {
    ready,
    parameters,
    page,
    pageSize,
    setPage: (nextPage: number, lastKnownPage?: number) =>
      update({ page: Math.max(1, Math.min(nextPage, lastKnownPage || Number.MAX_SAFE_INTEGER)) }),
    setPageSize: (nextPageSize: number) => update({ pageSize: Math.max(1, Math.min(nextPageSize, 100)) }, true),
    update,
  };
}

export function usePaginatedList<T>(path: string | null) {
  const [response, setResponse] = useState<PaginatedResponse<T> | null>(null);
  const [error, setError] = useState<ListError>(null);
  const [loading, setLoading] = useState(false);
  const request = useRef(0);

  const load = useCallback(async () => {
    if (!path) return null;
    const currentRequest = ++request.current;
    setLoading(true);
    setError(null);
    try {
      const result = await getPaginated<T>(path);
      if (currentRequest === request.current) setResponse(result);
      return result;
    } catch (cause) {
      if (currentRequest === request.current) {
        setError({ message: errorMessage(cause), requestId: cause instanceof ApiError ? cause.requestId : undefined });
      }
      return null;
    } finally {
      if (currentRequest === request.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);
  return { response, items: response?.data ?? null, pagination: response?.pagination ?? null, error, loading, refetch: load };
}

export function PaginationControl({ page, pageSize, total, loading = false, onPageChange, onPageSizeChange, allowPageSize = true }: {
  page: number;
  pageSize: number;
  total: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  allowPageSize?: boolean;
}) {
  const pages = totalPages(total, pageSize);
  const safePage = boundedPage(page, total, pageSize);
  return <nav className="pagination" aria-label="Pagination">
    <div className="pagination-summary" aria-live="polite">
      <strong>Page {pages === 0 ? 1 : safePage}</strong>
      <span>{total} result{total === 1 ? "" : "s"}{loading ? " · Updating…" : ""}</span>
    </div>
    <div className="pagination-actions">
      {allowPageSize && onPageSizeChange && <label>Rows
        <select className="select" value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))} aria-label="Results per page">
          {PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
      </label>}
      <button type="button" className="button button-secondary" disabled={safePage <= 1 || total === 0 || loading} onClick={() => onPageChange(Math.max(1, safePage - 1))}>Previous</button>
      <button type="button" className="button button-secondary" disabled={pages === 0 || safePage >= pages || loading} onClick={() => onPageChange(Math.min(pages, safePage + 1))}>Next</button>
    </div>
  </nav>;
}
