"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { EngagementStatus, FeedbackLink } from "@/lib/contracts";
import { ApiError, apiRequest, errorMessage, errorPresentation, type ApiErrorPresentation } from "@/lib/api";
import { copyFeedbackLink, feedbackLinkPath, formatFeedbackLinkExpiry, isFeedbackLinkExpired, shareFeedbackLink, type FeedbackLinkAudience } from "@/lib/feedback-link";
import { MISSING_PASSENGER_PHONE_MESSAGE, openFeedbackOnWhatsApp } from "@/lib/whatsapp-feedback";
import { Modal } from "./modal";
import { ErrorAlert } from "./ui";
import { DATA_INVALIDATED_EVENT, invalidateEngagementFeedbackData } from "@/lib/data-invalidation";
import { invalidateCaches } from "@/lib/feedback-contract";
import { closeGroupFeedback, generateFeedbackLink, readFeedbackMode } from "@/lib/group-feedback";
import { AlertDialog } from "./alert-dialog";

type Notice = ApiErrorPresentation | null;
const subscribeToShareSupport = () => () => undefined;

function notice(cause: unknown, audience: FeedbackLinkAudience): Notice {
  const message = cause instanceof ApiError && cause.status === 404
    ? audience === "driver" ? "This engagement is unavailable or is not assigned to you." : "This engagement is unavailable."
    : errorMessage(cause);
  return { ...errorPresentation(cause), message };
}

/** One collection mode governs every sharing method for this engagement. */
export function FeedbackCollectionControls({ engagementId, audience, status, children }: {
  engagementId: string;
  audience: FeedbackLinkAudience;
  status: EngagementStatus;
  children: ReactNode;
}) {
  const [details, setDetails] = useState<FeedbackLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Notice>(null);
  const [modeLocked, setModeLocked] = useState(false);
  const [loadVersion, setLoadVersion] = useState(0);
  const mutationInFlight = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    async function readMode() {
      setLoading(true);
      try {
        const response = await apiRequest<{ data: FeedbackLink }>(feedbackLinkPath(audience, engagementId), { signal: controller.signal });
        if (!controller.signal.aborted) { setDetails(readFeedbackMode(response.data)); setError(null); }
      } catch (cause) {
        if (!controller.signal.aborted) setError(notice(cause, audience));
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void readMode();
    window.addEventListener(DATA_INVALIDATED_EVENT, readMode);
    return () => { controller.abort(); window.removeEventListener(DATA_INVALIDATED_EVENT, readMode); };
  }, [audience, engagementId, loadVersion]);

  async function changeMode(mode: boolean) {
    if (mutationInFlight.current) return;
    mutationInFlight.current = true; setLoading(true); setError(null);
    try { setDetails(await generateFeedbackLink(audience, engagementId, mode)); }
    catch (cause) {
      setError(notice(cause, audience));
      if (cause instanceof ApiError && cause.code === "FEEDBACK_LINK_MODE_LOCKED") {
        setModeLocked(true);
        try {
          const response = await apiRequest<{ data: FeedbackLink }>(feedbackLinkPath(audience, engagementId));
          setDetails(readFeedbackMode(response.data));
        } catch { /* Preserve the last authoritative mode until it can be refreshed. */ }
      }
    } finally { mutationInFlight.current = false; setLoading(false); }
  }

  return <div className="feedback-collection-controls">
    <div className="feedback-collection-mode" aria-busy={loading}>
      <label className="check-row"><input type="checkbox" checked={details?.allowMultipleSubmissions ?? false} disabled={loading || !details || status !== "READY" || modeLocked} onChange={event => void changeMode(event.target.checked)} /><span>Allow feedback from multiple travellers</span></label>
      <p className="field-help">{loading ? "Loading collection mode…" : status !== "READY" || modeLocked ? "The collection mode is fixed after passenger feedback starts." : "Applies to both WhatsApp and feedback link sharing. Changes save automatically."}</p>
      {error && <ErrorAlert {...error} />}
      {!loading && !details && <button className="button button-secondary" onClick={() => setLoadVersion(value => value + 1)}>Retry collection mode</button>}
    </div>
    <fieldset className="feedback-sharing-actions" disabled={loading || !details} aria-label="Share passenger feedback">{children}</fieldset>
  </div>;
}

export function ShareFeedbackLinkAction({ engagementId, audience }: { engagementId: string; audience: FeedbackLinkAudience; status?: EngagementStatus }) {
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState<FeedbackLink | null>(null);
  const [error, setError] = useState<Notice>(null);
  const [loading, setLoading] = useState(false);

  const [closing, setClosing] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const mutationInFlight=useRef(false);
  async function renew(mode:boolean) {
    if(mutationInFlight.current)return;
    mutationInFlight.current=true;setLoading(true);setError(null);
    try { setDetails(await generateFeedbackLink(audience,engagementId,mode)); }
    catch(cause) {
      setError(notice(cause,audience));
      if(cause instanceof ApiError && cause.code==="FEEDBACK_LINK_MODE_LOCKED") {
        try { const response=await apiRequest<{data:FeedbackLink}>(feedbackLinkPath(audience,engagementId));setDetails(readFeedbackMode(response.data)); } catch { /* Keep the current link visible for recovery. */ }
      }
    } finally {mutationInFlight.current=false;setLoading(false);}
  }
  async function closeCollection() {
    setClosing(true);setError(null);
    try { await closeGroupFeedback(engagementId);setConfirmClose(false);setOpen(false);invalidateEngagementFeedbackData();invalidateCaches(["feedback-lists","feedback-detail","analytics","driver-performance","passenger-context"]); }
    catch(cause){setConfirmClose(false);setError(notice(cause,audience));}
    finally{setClosing(false);}
  }
  async function load() {
    setLoading(true); setError(null);
    try {
      setDetails(await generateFeedbackLink(audience, engagementId));
    } catch (cause) {
      setDetails(null); setError(notice(cause, audience));
    } finally { setLoading(false); }
  }

  function show() { setOpen(true); void load(); }
  useEffect(()=>{const invalidate=()=>{setOpen(false);setDetails(null)};window.addEventListener(DATA_INVALIDATED_EVENT,invalidate);return()=>window.removeEventListener(DATA_INVALIDATED_EVENT,invalidate)},[]);

  return <>
    <button className="button" onClick={show}>Share feedback link</button>
    {open && <FeedbackLinkDialog details={details} loading={loading} error={error} onRetry={() => void load()} onDismiss={() => !loading && setOpen(false)} onRenew={()=>details&&void renew(details.allowMultipleSubmissions)} onCloseCollection={audience==="admin"&&details?.allowMultipleSubmissions?()=>setConfirmClose(true):undefined} />}
    {confirmClose && <AlertDialog title="Close group feedback?" confirmLabel="Close group feedback" busy={closing} destructive onCancel={()=>setConfirmClose(false)} onConfirm={()=>void closeCollection()}><p>This ends collection and invalidates the shared link. Existing responses are retained. The collection cannot be reopened.</p></AlertDialog>}
  </>;
}

function WhatsAppLogo() {
  return <svg className="whatsapp-logo" aria-hidden="true" viewBox="0 0 24 24"><path d="M20.5 3.5A11.8 11.8 0 0 0 12.1 0C5.6 0 .3 5.3.3 11.8c0 2.1.5 4.1 1.6 5.9L.2 24l6.4-1.7a11.8 11.8 0 0 0 5.6 1.4h.1c6.5 0 11.7-5.3 11.7-11.8 0-3.2-1.2-6.1-3.5-8.4Zm-8.3 18.2c-1.7 0-3.5-.5-5-1.4l-.4-.2-3.8 1 1-3.7-.2-.4a9.8 9.8 0 1 1 8.4 4.7Zm5.4-7.3c-.3-.2-1.8-.9-2.1-1-.3-.1-.5-.2-.7.2-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6.1-1.7-.8-2.8-1.5-3.9-3.4-.3-.5.3-.5.8-1.6.1-.2 0-.4 0-.6l-1-2.4c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-.3.4-1.2 1.2-1.2 2.9s1.2 3.3 1.4 3.5c.2.2 2.4 3.7 5.9 5.2.8.4 1.5.6 2 .7.8.3 1.6.2 2.2.1.7-.1 1.8-.7 2-1.4.3-.7.3-1.3.2-1.4-.1-.1-.3-.2-.6-.4Z"/></svg>;
}

export function ShareFeedbackOnWhatsAppAction({ engagementId, audience = "admin", recipientName = "there", passengerPhone, editHref }: { engagementId: string; audience?: FeedbackLinkAudience; recipientName?: string; passengerPhone?: string | null; editHref?: string }) {
  const requestInFlight = useRef(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Notice>(null);
  const [opened, setOpened] = useState(false);
  const missing = passengerPhone === null;
  const helpId = `whatsapp-share-help-${engagementId}`;

  async function share() {
    if (requestInFlight.current || missing) return;
    requestInFlight.current = true;
    setLoading(true); setError(null); setOpened(false);
    try {
      const result = await openFeedbackOnWhatsApp(engagementId, audience, recipientName);
      if (result === "missing-phone") {
        setError({ message: MISSING_PASSENGER_PHONE_MESSAGE });
        return;
      }
      setOpened(true);
    } catch (cause) {
      setError(notice(cause, audience));
    } finally {
      requestInFlight.current = false;
      setLoading(false);
    }
  }

  return <div className="whatsapp-share">
    <button className="button button-secondary whatsapp-button" type="button" disabled={missing || loading} aria-describedby={missing ? helpId : undefined} aria-label="Share feedback on WhatsApp" onClick={() => void share()}>
      {loading ? "Opening…" : <>Share with <WhatsAppLogo /></>}
    </button>
    {missing && <small id={helpId}>{MISSING_PASSENGER_PHONE_MESSAGE} {editHref && <Link className="text-link" href={editHref}>Add phone number</Link>}</small>}
    {error && <ErrorAlert {...error} />}
    {opened && !error && <small className="share-link-status" role="status">WhatsApp opened. Review the message, then press Send in WhatsApp.</small>}
  </div>;
}

export function FeedbackLinkDialog({ details, loading = false, error = null, onRetry, onDismiss, onRenew, onCloseCollection }: {
  onRenew?:()=>void;
  onCloseCollection?:()=>void;
  details: FeedbackLink | null;
  loading?: boolean;
  error?: Notice;
  onRetry?: () => void;
  onDismiss: () => void;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [shareState, setShareState] = useState<"idle" | "cancelled" | "failed">("idle");
  const canShare = useSyncExternalStore(subscribeToShareSupport, () => typeof navigator.share === "function", () => false);
  const expired = details ? isFeedbackLinkExpired(details.feedbackAccessTokenExpiresAt) : false;

  async function copy() {
    if (!details) return;
    setCopyState("idle");
    try {
      await copyFeedbackLink(details.feedbackLink, navigator.clipboard);
      setCopyState("copied");
    } catch { setCopyState("failed"); }
  }

  async function share() {
    if (!details || !canShare) return;
    setShareState("idle");
    try {
      const result = await shareFeedbackLink(details.feedbackLink, navigator.share.bind(navigator), details.allowMultipleSubmissions);
      if (result === "cancelled") setShareState("cancelled");
    } catch {
      setShareState("failed");
    }
  }

  return <Modal onDismiss={onDismiss}><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="feedback-link-title">
    <p className="eyebrow">Passenger feedback</p>
    <h2 id="feedback-link-title">Share feedback link</h2>
    {loading && <div className="share-link-loading" aria-live="polite"><div className="skeleton" /><p>Retrieving the secure link…</p></div>}
    {error && <><ErrorAlert {...error} />{onRetry && <button className="button button-secondary" onClick={onRetry}>Try again</button>}</>}
    {details && <>
      {details.allowMultipleSubmissions && <p>Share this link once with the group. Each traveller should respond using their own phone number, including country code.</p>}
      {onCloseCollection && <button className="button button-danger" disabled={loading} onClick={onCloseCollection}>Close group feedback</button>}
      {expired && <div className="alert" role="alert"><strong>This link has expired.</strong><div>Renew the link explicitly to continue collecting feedback.</div></div>}
      {expired&&onRenew&&<button className="button" disabled={loading} onClick={onRenew}>Renew expired link</button>}
      <label className="field share-link-field"><span>Passenger link</span><input className="input" value={details.feedbackLink} readOnly aria-label="Passenger feedback link" /></label>
      <p className="share-link-expiry">Expires {formatFeedbackLinkExpiry(details.feedbackAccessTokenExpiresAt)}</p>
      {copyState === "copied" && <p className="share-link-status" role="status">Link copied.</p>}
      {copyState === "failed" && <p className="share-link-status share-link-error" role="alert">Couldn’t copy the link. Select and copy it manually.</p>}
      {shareState === "cancelled" && <p className="share-link-status" role="status">Sharing cancelled.</p>}
      {shareState === "failed" && <p className="share-link-status share-link-error" role="alert">Couldn’t open the share menu. Copy the link instead.</p>}
      <div className="dialog-actions">
        <button className="button button-secondary" onClick={onDismiss}>Close</button>
        {canShare && <button className="button button-secondary" disabled={expired||loading} onClick={() => void share()}>Share…</button>}
        <button className="button" disabled={expired||loading} onClick={() => void copy()}>{copyState === "copied" ? "Copied" : "Copy link"}</button>
      </div>
    </>}
  </section></Modal>;
}
