import type { PaginatedResponse } from "./contracts.ts";

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 25;
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

export function totalPages(total: number, pageSize: number) {
  return Math.ceil(Math.max(0, total) / Math.max(1, pageSize));
}

export function boundedPage(requestedPage: number, total: number, pageSize: number) {
  return Math.max(1, Math.min(Math.max(1, requestedPage), Math.max(1, totalPages(total, pageSize))));
}

export function positiveInteger(value: string | null | undefined, fallback: number, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? Math.min(parsed, maximum) : fallback;
}

export function pageAfterRemovingLastItem(page: number, itemsOnPage: number) {
  return itemsOnPage <= 1 && page > 1 ? page - 1 : page;
}

export function listQuery(parameters: Record<string, string | number | null | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(parameters)) {
    if (value !== null && value !== undefined && value !== "") search.set(key, String(value));
  }
  return search.toString();
}

export function updateListSearch(currentSearch: string, changes: Record<string, string | number | null | undefined>, resetPage = false) {
  const next = new URLSearchParams(currentSearch);
  if (resetPage) next.set("page", "1");
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === undefined || value === "") next.delete(key);
    else next.set(key, String(value));
  }
  return next;
}

export function parsePaginatedResponse<T>(payload: unknown): PaginatedResponse<T> {
  if (!payload || typeof payload !== "object") throw new TypeError("Invalid paginated response");
  const candidate = payload as { data?: unknown; pagination?: Record<string, unknown> };
  const pagination = candidate.pagination;
  if (
    !Array.isArray(candidate.data) ||
    !pagination ||
    !Number.isInteger(pagination.page) ||
    Number(pagination.page) < 1 ||
    !Number.isInteger(pagination.pageSize) ||
    Number(pagination.pageSize) < 1 ||
    Number(pagination.pageSize) > 100 ||
    !Number.isInteger(pagination.total) ||
    Number(pagination.total) < 0
  ) {
    throw new TypeError("Invalid paginated response");
  }
  return payload as PaginatedResponse<T>;
}
