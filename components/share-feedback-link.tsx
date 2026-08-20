"use client";

import Link from "next/link";
import { useRef, useState, useSyncExternalStore } from "react";
import type { FeedbackLink } from "@/lib/contracts";
import { ApiError, apiRequest, errorMessage } from "@/lib/api";
import { copyFeedbackLink, feedbackLinkPath, formatFeedbackLinkExpiry, isFeedbackLinkExpired, shareFeedbackLink, type FeedbackLinkAudience } from "@/lib/feedback-link";
import { MISSING_PASSENGER_PHONE_MESSAGE, openFeedbackOnWhatsApp } from "@/lib/whatsapp-feedback";
import { Modal } from "./modal";
import { ErrorAlert } from "./ui";

type Notice = { message: string; requestId?: string } | null;
const subscribeToShareSupport = () => () => undefined;

function notice(cause: unknown, audience: FeedbackLinkAudience): Notice {
  const message = cause instanceof ApiError && cause.status === 404
    ? audience === "driver" ? "This trip is unavailable or is not assigned to you." : "This trip is unavailable."
    : errorMessage(cause);
  return { message, requestId: cause instanceof ApiError ? cause.requestId : undefined };
}

export function ShareFeedbackLinkAction({ tripId, audience }: { tripId: string; audience: FeedbackLinkAudience }) {
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState<FeedbackLink | null>(null);
  const [error, setError] = useState<Notice>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true); setError(null);
    try {
      const response = await apiRequest<{ data: FeedbackLink }>(feedbackLinkPath(audience, tripId));
      setDetails(response.data);
    } catch (cause) {
      setDetails(null); setError(notice(cause, audience));
    } finally { setLoading(false); }
  }

  function show() { setOpen(true); void load(); }

  return <>
    <button className="button" onClick={show}>Share feedback link</button>
    {open && <FeedbackLinkDialog details={details} loading={loading} error={error} onRetry={() => void load()} onDismiss={() => setOpen(false)} />}
  </>;
}

function WhatsAppLogo() {
  return <svg className="whatsapp-logo" aria-hidden="true" viewBox="0 0 24 24"><path d="M20.5 3.5A11.8 11.8 0 0 0 12.1 0C5.6 0 .3 5.3.3 11.8c0 2.1.5 4.1 1.6 5.9L.2 24l6.4-1.7a11.8 11.8 0 0 0 5.6 1.4h.1c6.5 0 11.7-5.3 11.7-11.8 0-3.2-1.2-6.1-3.5-8.4Zm-8.3 18.2c-1.7 0-3.5-.5-5-1.4l-.4-.2-3.8 1 1-3.7-.2-.4a9.8 9.8 0 1 1 8.4 4.7Zm5.4-7.3c-.3-.2-1.8-.9-2.1-1-.3-.1-.5-.2-.7.2-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6.1-1.7-.8-2.8-1.5-3.9-3.4-.3-.5.3-.5.8-1.6.1-.2 0-.4 0-.6l-1-2.4c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-.3.4-1.2 1.2-1.2 2.9s1.2 3.3 1.4 3.5c.2.2 2.4 3.7 5.9 5.2.8.4 1.5.6 2 .7.8.3 1.6.2 2.2.1.7-.1 1.8-.7 2-1.4.3-.7.3-1.3.2-1.4-.1-.1-.3-.2-.6-.4Z"/></svg>;
}

export function ShareFeedbackOnWhatsAppAction({ tripId, audience = "admin", recipientName = "there", passengerPhone, editHref }: { tripId: string; audience?: FeedbackLinkAudience; recipientName?: string; passengerPhone?: string | null; editHref?: string }) {
  const requestInFlight = useRef(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Notice>(null);
  const [opened, setOpened] = useState(false);
  const missing = passengerPhone === null;
  const helpId = `whatsapp-share-help-${tripId}`;

  async function share() {
    if (requestInFlight.current || missing) return;
    requestInFlight.current = true;
    setLoading(true); setError(null); setOpened(false);
    try {
      const result = await openFeedbackOnWhatsApp(tripId, audience, recipientName);
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

export function FeedbackLinkDialog({ details, loading = false, error = null, onRetry, onDismiss }: {
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
      const result = await shareFeedbackLink(details.feedbackLink, navigator.share.bind(navigator));
      if (result === "cancelled") setShareState("cancelled");
    } catch {
      setShareState("failed");
    }
  }

  return <Modal onDismiss={onDismiss}><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="feedback-link-title">
    <p className="eyebrow">Passenger feedback</p>
    <h2 id="feedback-link-title">Share feedback link</h2>
    {loading && <div className="share-link-loading" aria-live="polite"><div className="skeleton" /><p>Retrieving the secure link…</p></div>}
    {!loading && error && <><ErrorAlert {...error} />{onRetry && <button className="button button-secondary" onClick={onRetry}>Try again</button>}</>}
    {!loading && details && <>
      {expired && <div className="alert" role="alert"><strong>This link has expired.</strong><div>Ask the driver to start a new feedback handoff if one is available.</div></div>}
      <label className="field share-link-field"><span>Passenger link</span><input className="input" value={details.feedbackLink} readOnly aria-label="Passenger feedback link" /></label>
      <p className="share-link-expiry">Expires {formatFeedbackLinkExpiry(details.feedbackAccessTokenExpiresAt)}</p>
      {copyState === "copied" && <p className="share-link-status" role="status">Link copied.</p>}
      {copyState === "failed" && <p className="share-link-status share-link-error" role="alert">Couldn’t copy the link. Select and copy it manually.</p>}
      {shareState === "cancelled" && <p className="share-link-status" role="status">Sharing cancelled.</p>}
      {shareState === "failed" && <p className="share-link-status share-link-error" role="alert">Couldn’t open the share menu. Copy the link instead.</p>}
      <div className="dialog-actions">
        <button className="button button-secondary" onClick={onDismiss}>Close</button>
        {canShare && <button className="button button-secondary" disabled={expired} onClick={() => void share()}>Share…</button>}
        <button className="button" disabled={expired} onClick={() => void copy()}>{copyState === "copied" ? "Copied" : "Copy link"}</button>
      </div>
    </>}
  </section></Modal>;
}
