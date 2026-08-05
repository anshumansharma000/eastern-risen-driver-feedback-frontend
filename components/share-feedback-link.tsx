"use client";

import { useState, useSyncExternalStore } from "react";
import type { FeedbackLink } from "@/lib/contracts";
import { ApiError, apiRequest, errorMessage } from "@/lib/api";
import { copyFeedbackLink, feedbackLinkPath, formatFeedbackLinkExpiry, isFeedbackLinkExpired, shareFeedbackLink, type FeedbackLinkAudience } from "@/lib/feedback-link";
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
