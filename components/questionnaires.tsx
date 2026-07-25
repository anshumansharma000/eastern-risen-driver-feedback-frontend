"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import type { QuestionnaireSummary, QuestionnaireVersionSummary } from "@/lib/contracts";
import { ApiError, apiRequest, errorMessage } from "@/lib/api";
import { listQuery, totalPages } from "@/lib/pagination";
import { EmptyState, ErrorAlert, LoadingCards, StatusBadge } from "./ui";
import { Modal } from "./modal";
import { PaginationControl, useListSearchParams, usePaginatedList } from "./pagination";

type FormError = { message: string; requestId?: string } | null;

export function Questionnaires() {
  const search = useListSearchParams();
  const list = usePaginatedList<QuestionnaireSummary>(
    search.ready ? `/api/v1/admin/questionnaires?${listQuery({ page: search.page, pageSize: search.pageSize })}` : null,
  );
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<FormError>(null);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!list.pagination) return;
    const lastPage = Math.max(1, totalPages(list.pagination.total, list.pagination.pageSize));
    if (search.page > lastPage) search.setPage(lastPage, lastPage);
  }, [list.pagination, search.page]); // eslint-disable-line react-hooks/exhaustive-deps

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(null);
    const data = new FormData(event.currentTarget);
    try {
      await apiRequest("/api/v1/admin/questionnaires", { method: "POST", body: JSON.stringify({ name: data.get("name") }) });
      setShow(false);
      await list.refetch();
    } catch (cause) {
      setError({ message: errorMessage(cause), requestId: cause instanceof ApiError ? cause.requestId : undefined });
    } finally { setBusy(false); }
  }

  const shownError = error || list.error;
  return <>
    <div className="page-header"><div><p className="eyebrow">Versioned passenger form</p><h1>Questionnaires</h1><p>Drafts are editable. Published versions are immutable and remain attached to historical feedback.</p></div><button className="button" onClick={() => setShow(true)}>New questionnaire</button></div>
    {shownError && <ErrorAlert message={shownError.message} requestId={shownError.requestId} />}
    {list.items === null && !list.error && <LoadingCards />}
    {list.items?.length === 0 && !shownError && <EmptyState title="No questionnaires yet">Create a questionnaire and its first draft, then add active questions before publishing.</EmptyState>}
    {list.items && list.items.length > 0 && <div className="stack" aria-busy={list.loading}>{list.items.map((item) => <section className="card card-pad" key={item.id}><div className="trip-card-head"><div><span className="eyebrow">Questionnaire</span><h2 className="section-title">{item.name}</h2></div><StatusBadge label={item.status} tone={item.status === "ACTIVE" ? "success" : "danger"} /></div><div className="trip-actions"><button className="button button-secondary" aria-expanded={expanded === item.id} onClick={() => setExpanded((current) => current === item.id ? null : item.id)}>{expanded === item.id ? "Hide versions" : "Show versions"}</button></div>{expanded === item.id && <QuestionnaireVersions questionnaireId={item.id} />}</section>)}</div>}
    {list.pagination && <PaginationControl {...list.pagination} page={search.page} loading={list.loading} onPageChange={(page) => search.setPage(page, totalPages(list.pagination!.total, list.pagination!.pageSize))} onPageSizeChange={search.setPageSize} />}
    {show && <Modal onDismiss={() => setShow(false)}><form className="dialog" role="dialog" aria-modal="true" onSubmit={create}><span className="eyebrow">First draft included</span><h2>Create questionnaire</h2><div className="field"><label htmlFor="name">Name</label><input className="input" id="name" name="name" maxLength={200} required /></div><div className="dialog-actions"><button type="button" className="button button-secondary" onClick={() => setShow(false)}>Cancel</button><button className="button" disabled={busy}>Create</button></div></form></Modal>}
  </>;
}

function QuestionnaireVersions({ questionnaireId }: { questionnaireId: string }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<FormError>(null);
  const list = usePaginatedList<QuestionnaireVersionSummary>(
    `/api/v1/admin/questionnaires/${questionnaireId}/versions?${listQuery({ page, pageSize })}`,
  );

  useEffect(() => {
    if (!list.pagination) return;
    const lastPage = Math.max(1, totalPages(list.pagination.total, list.pagination.pageSize));
    if (page > lastPage) queueMicrotask(() => setPage(lastPage));
  }, [list.pagination, page]);

  async function clone() {
    setBusy(true); setError(null);
    try {
      await apiRequest(`/api/v1/admin/questionnaires/${questionnaireId}/versions`, { method: "POST" });
      await list.refetch();
    } catch (cause) {
      setError({ message: errorMessage(cause), requestId: cause instanceof ApiError ? cause.requestId : undefined });
    } finally { setBusy(false); }
  }

  const shownError = error || list.error;
  return <div style={{ marginTop: "1rem" }}>
    <div className="trip-actions"><button className="button button-secondary" onClick={() => void clone()} disabled={busy}>{busy ? "Creating…" : "Create next draft"}</button></div>
    {shownError && <ErrorAlert message={shownError.message} requestId={shownError.requestId} />}
    {list.items === null && !list.error && <p role="status">Loading versions…</p>}
    {list.items?.length === 0 && !shownError && <p className="trip-meta">No versions are available.</p>}
    {list.items && list.items.length > 0 && <div className="data-list" aria-busy={list.loading}>{list.items.map((version) => <div className="data-row" key={version.id}><span><strong>Version {version.versionNumber}</strong><small>{version.status === "DRAFT" ? "Editable until published" : "Immutable history"}</small></span><StatusBadge label={version.status} tone={version.status === "ACTIVE" ? "success" : version.status === "DRAFT" ? "warning" : "neutral"} /><span>{version.publishedAt ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(version.publishedAt)) : "Not published"}</span><Link className="button button-secondary" href={`/admin/questionnaires/${questionnaireId}?version=${version.id}`}>{version.status === "DRAFT" ? "Edit draft" : "View version"}</Link></div>)}</div>}
    {list.pagination && <PaginationControl {...list.pagination} page={page} loading={list.loading} onPageChange={(next) => setPage(Math.max(1, Math.min(next, Math.max(1, totalPages(list.pagination!.total, pageSize)))))} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />}
  </div>;
}
