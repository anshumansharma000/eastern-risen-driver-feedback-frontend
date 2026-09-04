"use client";
/* eslint-disable @next/next/no-img-element -- short-lived signed URLs must be used directly and never sent through an optimizer */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminFeedbackAnswer, AdminFeedbackDetail, AdminFeedbackPhotoAccessResponse, AdminFeedbackSummary, AdminFeedbackView, AgencySettings, FeedbackReviewState } from "@/lib/contracts";
import { ApiError, apiRequest, errorMessage, getData } from "@/lib/api";
import { categoryLabel, formatInTimezone, invalidateCaches, scoreLabel } from "@/lib/feedback-contract";
import { questionnairePurposeCopy } from "@/lib/feedback-sections";
import { ErrorAlert, LoadingCards, StatusBadge } from "./ui";
import { Modal } from "./modal";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const AGENT_BRANDS = {
  EASTERN_RISEN: {
    name: "Eastern Risen Expedition Private Limited",
    logo: "eastern-risen-logo.png",
  },
  ODISHA_TOUR_EXPERT: {
    name: "Odisha Tour Expert",
    logo: "odisha-tour-expert-logo.png",
  },
} as const;
const COMPANY_NAME = AGENT_BRANDS.EASTERN_RISEN.name;
type PrintMode = "AGENT" | "USER";
type PrintDialogStep = "COPY_TYPE" | "AGENT_BRAND";
type AgentBrandKey = keyof typeof AGENT_BRANDS;
type AgentBrand = (typeof AGENT_BRANDS)[AgentBrandKey];

export function AdminFeedbackDetailView({ feedbackId, view }: { feedbackId: string; view:AdminFeedbackView }) {
  const router = useRouter();
  const [detail, setDetail] = useState<AdminFeedbackDetail | null>(null);
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<FeedbackReviewState | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [printDialogStep, setPrintDialogStep] = useState<PrintDialogStep>("COPY_TYPE");
  const [printMode, setPrintMode] = useState<PrintMode>("AGENT");
  const [printBrand, setPrintBrand] = useState<AgentBrandKey>("EASTERN_RISEN");
  const [photoAccess, setPhotoAccess] = useState<AdminFeedbackPhotoAccessResponse["data"] | null>(null);
  const [photoVisible, setPhotoVisible] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const refreshedAfterFailure = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [value, settings] = await Promise.all([
        getData<AdminFeedbackDetail>(`/api/v1/admin/feedback/${encodeURIComponent(feedbackId)}?view=${view}`),
        getData<AgencySettings>("/api/v1/admin/settings").catch(() => null),
      ]);
      setDetail(value);
      setPhotoAccess(null);
      setPhotoVisible(false);
      setPhotoError("");
      refreshedAfterFailure.current=false;
      if (settings) setTimezone(settings.timezone);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause : new ApiError(0, "NETWORK_UNAVAILABLE", errorMessage(cause)));
    } finally {
      setLoading(false);
    }
  }, [feedbackId,view]);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);
  const answers = useMemo(() => {const order={ARRIVAL_EXPERIENCE:0,DRIVER_FEEDBACK:1,TOUR_EXPERIENCE:2};return (detail?.answers || []).filter((answer)=>view==="DRIVER"?answer.purpose==="DRIVER_FEEDBACK":answer.purpose!=="DRIVER_FEEDBACK").sort((a,b)=>order[a.purpose]-order[b.purpose]||a.displayOrder-b.displayOrder)}, [detail,view]);

  async function mutate() {
    if (!detail || !action) return;
    if (action === "ARCHIVED" && !reason.trim()) { setActionError("An archive reason is required."); return; }
    if (action === "ARCHIVED" && !window.confirm("Archive this feedback? It will be excluded from analytics and cannot be restored.")) return;
    setBusy(true);
    setActionError("");
    try {
      const response = await apiRequest<{ data: AdminFeedbackSummary }>(`/api/v1/admin/feedback/${encodeURIComponent(feedbackId)}/review-state`, { method: "PATCH", body: JSON.stringify({ state: action, ...(reason.trim() ? { reason: reason.trim() } : {}) }) });
      setDetail(current => current ? { ...current, ...response.data } : current);
      setAction(null);
      setReason("");
      invalidateCaches(["feedback-detail", "feedback-lists", "analytics", "driver-performance"]);
      await load();
    } catch (cause) {
      const code = cause instanceof ApiError ? cause.code : "";
      if (cause instanceof ApiError && code === "FEEDBACK_NOT_FOUND") { setAction(null); setError(cause); }
      else setActionError(code === "FEEDBACK_ARCHIVE_REASON_REQUIRED" ? "An archive reason is required." : code === "FEEDBACK_REVIEW_TRANSITION_INVALID" ? "That review action is no longer valid. Refresh and review the current state." : code === "FEEDBACK_RESTORE_NOT_SUPPORTED" ? "Archived feedback cannot be restored." : errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  function openPrintDialog() {
    setPrintDialogStep("COPY_TYPE");
    setPrintDialogOpen(true);
  }

  function printCopy(mode: PrintMode, brand: AgentBrandKey = "EASTERN_RISEN") {
    setPrintMode(mode);
    setPrintBrand(brand);
    setPrintDialogOpen(false);
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  }

  async function viewPhoto(forceRefresh=false) {
    if (!detail?.photo) return;
    setPhotoVisible(true);
    setPhotoError("");
    if (!forceRefresh&&photoAccess&&photoAccess.id===detail.photo.id&&new Date(photoAccess.expiresAt).getTime()>Date.now()+5_000) return;
    setPhotoLoading(true);
    try {
      const response=await apiRequest<AdminFeedbackPhotoAccessResponse>(`/api/v1/admin/feedback/${encodeURIComponent(feedbackId)}/photo-url`);
      setPhotoAccess(response.data);
    } catch (cause) {
      setPhotoAccess(null);
      setPhotoError(errorMessage(cause));
    } finally { setPhotoLoading(false); }
  }

  async function refreshFailedPhoto() {
    setPhotoAccess(null);
    if (refreshedAfterFailure.current) { setPhotoError("The photo could not be displayed. Request a fresh link and try again."); return; }
    refreshedAfterFailure.current=true;
    await viewPhoto(true);
  }

  if (loading && !detail) return <LoadingCards />;
  if (error?.code === "FEEDBACK_NOT_FOUND" || error?.status === 404) return <div className="card empty"><h1>Feedback not found</h1><p>This record may no longer be available.</p><button className="button button-secondary" onClick={() => router.back()}>Back to feedback</button></div>;
  if (error?.status === 403) return <div className="alert" role="alert"><strong>Admin access required.</strong><div>Your account cannot inspect passenger feedback.</div></div>;
  if (!detail) return <>{error && <ErrorAlert message={errorMessage(error)} requestId={error.requestId} />}<button className="button button-secondary" onClick={() => void load()}>Try again</button></>;

  const archived = detail.reviewState === "ARCHIVED";
  return <div className="feedback-detail-page">
    <div className="screen-feedback-detail">
      <button className="button button-secondary feedback-back" onClick={() => router.push(`/admin/feedback?view=${view}`)}>← Back to {view==="DRIVER"?"driver":"company"} feedback</button>
      <div className="page-header feedback-detail-header">
        <div><p className="eyebrow">{view==="DRIVER"?"Driver feedback":"Company feedback"}</p><h1>{detail.respondent.name}</h1><p>Booking {detail.bookingReference} · submitted {formatInTimezone(detail.submittedAt, timezone)}</p></div>
        <div className="feedback-header-actions"><StatusBadge label={detail.reviewState === "NORMAL" ? "Normal" : detail.reviewState === "FLAGGED" ? "Flagged" : "Archived"} tone={detail.reviewState === "FLAGGED" ? "warning" : archived ? "neutral" : "success"} /><button className="button" type="button" onClick={openPrintDialog}>Print feedback</button></div>
      </div>
      {error && <ErrorAlert message={errorMessage(error)} requestId={error.requestId} />}
      <section className="grid-3 feedback-detail-summary"><div className="card stat"><span>Overall score</span><strong>{scoreLabel(detail.overallScore)}</strong><small>Average of scored answers</small></div><div className="card stat"><span>Submitted</span><strong className="metric-word">{detail.submissionMode === "OFFLINE_SYNC" ? "Offline sync" : "Online"}</strong><small>Received {formatInTimezone(detail.receivedAt, timezone)}</small></div><div className="card stat"><span>Review status</span><strong className="metric-word">{detail.reviewState.toLowerCase()}</strong><small>{archived ? "This feedback is read-only" : "Current administrative status"}</small></div></section>
      {!archived && <div className="trip-actions detail-actions">{detail.reviewState === "NORMAL" ? <button className="button button-secondary" onClick={() => setAction("FLAGGED")}>Flag feedback</button> : <button className="button button-secondary" onClick={() => setAction("NORMAL")}>Unflag feedback</button>}<button className="button button-danger" onClick={() => setAction("ARCHIVED")}>Archive feedback</button></div>}
      <div className="grid-2 detail-grid"><section className="card card-pad"><h2 className="section-title">Passenger</h2><Definition items={[["Name", detail.respondent.name], ["Phone", detail.respondent.phone], ["Email", detail.respondent.email], ["Booking reference", detail.respondent.bookingReference]]} /></section><section className="card card-pad"><h2 className="section-title">Driver engagement {detail.engagement.sequenceNumber}</h2><Definition items={[["Driver",detail.driver.displayName],["Driver type",detail.driver.sourceType==="AGENCY"?"Agency driver":`Outsourced · ${detail.driver.vendorName||"Vendor unavailable"}`]]}/><ol className="history-list">{[...detail.trips].sort((a,b)=>a.scheduledAt.localeCompare(b.scheduledAt)).map(trip=><li key={trip.id}><strong>{trip.pickupLocation} → {trip.destination}</strong><small>{formatInTimezone(trip.scheduledAt,timezone)} – {formatInTimezone(trip.scheduledEndAt,timezone)} · {trip.vehicle.displayName} · {trip.vehicle.registrationNumber}</small></li>)}</ol></section></div>
      {detail.photo&&<section className="card card-pad admin-photo-card"><div className="section-heading"><div><p className="eyebrow">Passenger-provided</p><h2 className="section-title">Trip photo</h2></div><button type="button" className="button button-secondary" disabled={photoLoading} onClick={()=>{refreshedAfterFailure.current=false;void viewPhoto(true)}}>{photoLoading?"Getting secure photo…":"View photo"}</button></div><Definition items={[["Size",formatAdminBytes(detail.photo.byteSize)],["Attached",formatInTimezone(detail.photo.attachedAt,timezone)]]}/>{photoVisible&&<div className="admin-photo-viewer">{photoLoading&&<div className="skeleton" aria-label="Loading photo"/>}{photoError&&<div className="alert" role="alert"><strong>Photo unavailable</strong><div>{photoError}</div><button type="button" className="button button-secondary" onClick={()=>{refreshedAfterFailure.current=false;void viewPhoto(true)}}>Request a fresh link</button></div>}{photoAccess&&!photoLoading&&<img src={photoAccess.url} alt="Passenger-provided trip photo with the driver" onError={()=>void refreshFailedPhoto()}/>}</div>}</section>}
      <AnswerList answers={answers} />
      <div className="grid-2 detail-grid"><section className="card card-pad"><h2 className="section-title">Review history</h2>{detail.reviewHistory.length === 0 ? <p>No administrative review actions.</p> : <ol className="history-list">{detail.reviewHistory.map(event => <li key={event.id}><strong>{event.action.toLowerCase()}</strong> by {event.performedBy.displayName}<small>{formatInTimezone(event.createdAt, timezone)}{event.reason ? ` · ${event.reason}` : " · No reason supplied"}</small></li>)}</ol>}</section><details className="card card-pad technical-details"><summary>Technical details</summary><Definition items={[["Consent version", detail.consentVersionId], ["Consented at", formatInTimezone(detail.consentedAt, timezone)], ...detail.questionnaireSections.map((section)=>[`${questionnairePurposeCopy[section.purpose].label} version`,section.questionnaireVersionId] as [string,string])]} /></details></div>
    </div>

    <PrintReport detail={detail} answers={answers} timezone={timezone} mode={printMode} brand={AGENT_BRANDS[printBrand]} view={view} />

    {printDialogOpen && <Modal onDismiss={() => setPrintDialogOpen(false)}>
      <section className="dialog print-dialog" role="dialog" aria-modal="true" aria-labelledby="print-title">
        <p className="eyebrow">Print feedback</p>
        {printDialogStep === "COPY_TYPE" ? <>
          <h2 id="print-title">Choose the copy type</h2>
          <p>Choose who this printed feedback copy is for.</p>
          <div className="print-copy-options">
            <button type="button" className="print-copy-option" onClick={() => setPrintDialogStep("AGENT_BRAND")}><span className="print-copy-icon" aria-hidden="true">AG</span><span><strong>Agent copy</strong><small>Choose the agent name and logo for the report header.</small></span></button>
            <button type="button" className="print-copy-option" onClick={() => printCopy("USER")}><span className="print-copy-icon" aria-hidden="true">{initials(detail.respondent.name)}</span><span><strong>User copy</strong><small>{detail.respondent.name} will be the primary heading.</small></span></button>
          </div>
        </> : <>
          <h2 id="print-title">Choose the agent brand</h2>
          <p>The selected name and logo will appear in the printed report header.</p>
          <div className="print-copy-options">
            {(Object.entries(AGENT_BRANDS) as Array<[AgentBrandKey, AgentBrand]>).map(([key, brand]) => <button key={key} type="button" className="print-copy-option print-brand-option" onClick={() => printCopy("AGENT", key)}><span className="print-brand-option-logo"><img src={`${basePath}/${brand.logo}`} alt="" aria-hidden="true" /></span><span><strong>{brand.name}</strong><small>Use this brand for the agent copy.</small></span></button>)}
          </div>
        </>}
        <div className="dialog-actions">
          {printDialogStep === "AGENT_BRAND" && <button className="button button-secondary" type="button" onClick={() => setPrintDialogStep("COPY_TYPE")}>Back</button>}
          <button className="button button-secondary" type="button" onClick={() => setPrintDialogOpen(false)}>Cancel</button>
        </div>
      </section>
    </Modal>}
    {action && <Modal onDismiss={() => setAction(null)}><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="review-title"><p className="eyebrow">Review action</p><h2 id="review-title">{action === "FLAGGED" ? "Flag feedback" : action === "NORMAL" ? "Unflag feedback" : "Archive feedback"}</h2><p>{action === "ARCHIVED" ? "Archiving excludes this feedback from aggregates and cannot be reversed." : "This changes only the administrative review state; submitted answers remain unchanged."}</p><div className="field"><label htmlFor="review-reason">Reason {action === "ARCHIVED" ? "(required)" : "(optional)"}</label><textarea id="review-reason" className="textarea" maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} aria-invalid={!!actionError} />{actionError && <small className="field-error" role="alert">{actionError}</small>}</div><div className="dialog-actions"><button className="button button-secondary" onClick={() => setAction(null)}>Cancel</button><button className={action === "ARCHIVED" ? "button button-danger" : "button"} disabled={busy} onClick={() => void mutate()}>{busy ? "Saving…" : action === "ARCHIVED" ? "Archive permanently" : "Confirm action"}</button></div></section></Modal>}
  </div>;
}

function AnswerList({ answers, print = false }: { answers: AdminFeedbackAnswer[]; print?: boolean }) {
  return <section className={print ? "print-answers" : "card card-pad feedback-answers"}><h2 className="section-title">Feedback answers</h2>{!print && <p className="trip-meta">Clear responses to each question, grouped by feedback section.</p>}<div className="answer-list">{answers.map((answer, index) => <article key={answer.id} className="answer-row"><header><span className="answer-number">{index + 1}</span><span className="answer-category">{questionnairePurposeCopy[answer.purpose].label} · {categoryLabel(answer.category)}</span>{answer.numericScore !== null && <strong className="answer-score">Score: {answer.numericScore.toFixed(2)}</strong>}</header><h3>{answer.prompt}</h3><div className="answer-response"><span className="answer-response-label">Response</span><div className="answer-value"><HumanAnswerValue value={answer.value} questionType={answer.questionType} /></div></div></article>)}</div></section>;
}

function HumanAnswerValue({ value, questionType }: { value: unknown; questionType?: AdminFeedbackAnswer["questionType"] }) {
  const responses = responseStrings(value, questionType);
  if (!responses.length) return <span className="answer-empty">No answer provided</span>;
  if (responses.length === 1) return <span className={questionType === "TEXT" ? "answer-text" : undefined}>{responses[0]}</span>;
  return <ul className="answer-choice-list">{responses.map(response => <li key={response}>{response}</li>)}</ul>;
}

function responseStrings(value: unknown, questionType?: AdminFeedbackAnswer["questionType"]): string[] {
  if (value === null || value === undefined || value === "") return [];
  if (typeof value === "boolean") return [value ? "Yes" : "No"];
  if (typeof value === "number") return [questionType === "STAR_RATING" ? `${value} out of 5` : String(value)];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return unique(value.flatMap(item => responseStrings(item, questionType)));
  if (typeof value !== "object") return [String(value)];

  const entries = Object.entries(value as Record<string, unknown>);
  const preferredKeys = ["response", "label", "optionlabel", "displaylabel", "displayvalue", "text", "answer", "selectedoption"];
  for (const preferredKey of preferredKeys) {
    const match = entries.find(([key]) => normalizedKey(key) === preferredKey);
    if (match) {
      const preferred = responseStrings(match[1], questionType);
      if (preferred.length) return preferred;
    }
  }

  const metadataKeys = new Set(["optionkey", "valuekey", "key", "id", "score", "scorevalue", "numericscore"]);
  return unique(entries.filter(([key]) => !metadataKeys.has(normalizedKey(key))).flatMap(([, item]) => responseStrings(item, questionType)));
}

function normalizedKey(value: string) { return value.toLowerCase().replace(/[^a-z0-9]/g, ""); }
function unique(values: string[]) { return [...new Set(values.map(value => value.trim()).filter(Boolean))]; }

function PrintReport({ detail, answers, timezone, mode, brand, view }: { detail: AdminFeedbackDetail; answers: AdminFeedbackAnswer[]; timezone: string; mode: PrintMode; brand: AgentBrand; view:AdminFeedbackView }) {
  const userCopy = mode === "USER";
  return <article className="print-feedback-report" aria-hidden="true">
    <header className="print-report-header"><p>{userCopy ? "User copy" : "Agent copy"}</p>{userCopy ? <h1>{detail.respondent.name}</h1> : <div className="print-report-brand"><img src={`${basePath}/${brand.logo}`} alt="" aria-hidden="true" /><h1>{brand.name}</h1></div>}<h2>{view==="DRIVER"?"Driver":"Company"} feedback report</h2><span>{userCopy ? `Issued by ${COMPANY_NAME}` : `Prepared for ${detail.respondent.name}`}</span></header>
    <section className="print-report-summary"><div><span>Booking reference</span><strong>{detail.bookingReference}</strong></div><div><span>Submitted</span><strong>{formatInTimezone(detail.submittedAt, timezone)}</strong></div><div><span>Overall score</span><strong>{scoreLabel(detail.overallScore)}</strong></div></section>
    <section className="print-report-details"><div><h2>Passenger</h2><Definition items={[["Name", detail.respondent.name], ["Phone", detail.respondent.phone], ["Email", detail.respondent.email]]} /></div><div><h2>Driver engagement {detail.engagement.sequenceNumber}</h2><Definition items={[["Driver",detail.driver.displayName],["Covered trips",String(detail.trips.length)],...detail.trips.map((trip,index)=>[`Trip ${index+1}`,`${trip.pickupLocation} → ${trip.destination} · ${trip.vehicle.displayName}`] as [string,string])]} /></div></section>
    <AnswerList answers={answers} print />
    <footer><span>{userCopy ? COMPANY_NAME : brand.name}</span><span>Booking {detail.bookingReference}</span></footer>
  </article>;
}

function Definition({ items }: { items: Array<[string, string]> }) { return <dl className="definition-list">{items.map(([term, value]) => <div key={term}><dt>{term}</dt><dd>{value}</dd></div>)}</dl>; }
function initials(value: string) { return value.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join("") || "U"; }
function formatAdminBytes(bytes:number){return bytes<1024*1024?`${Math.max(1,Math.round(bytes/1024))} KB`:`${(bytes/(1024*1024)).toFixed(1)} MB`}
