"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { apiRequest, errorPresentation, type ApiErrorPresentation } from "@/lib/api";
import type { BookingDetail, FeedbackBranding } from "@/lib/contracts";
import { FeedbackBrandingHeader } from "./feedback-branding-header";
import { ErrorAlert } from "./ui";

const defaultBranding: FeedbackBranding = { title: null, logo: null };
const logoTypes = ["image/png", "image/jpeg", "image/webp"];
const logoHelp = "Choose a PNG, JPEG, or WebP image up to 256 KB.";

export function BookingFeedbackBranding({
  booking,
  onSaved,
}: {
  booking: BookingDetail;
  onSaved: (branding: FeedbackBranding) => void;
}) {
  const saved = booking.feedbackBranding ?? defaultBranding;
  const [title, setTitle] = useState(saved.title ?? "");
  const [logo, setLogo] = useState(saved.logo);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<ApiErrorPresentation | null>(null);
  const editable = booking.status !== "ARCHIVED";
  const draft = { title: title.trim() || null, logo };
  const changed = draft.title !== saved.title || draft.logo !== saved.logo;

  function chooseLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setStatus("");
    setError(null);
    if (!logoTypes.includes(file.type) || file.size > 256 * 1024 || file.size === 0) {
      setError({ message: logoHelp });
      return;
    }

    const reader = new FileReader();
    setReading(true);
    reader.onload = () => setLogo(String(reader.result));
    reader.onerror = () => setError({ message: "The logo could not be opened. Choose the file again." });
    reader.onloadend = () => setReading(false);
    reader.readAsDataURL(file);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editable || !changed || reading || saving) return;
    setSaving(true);
    setStatus("");
    setError(null);
    try {
      const { data } = await apiRequest<{ data: FeedbackBranding }>(
        `/api/v1/admin/bookings/${encodeURIComponent(booking.id)}/feedback-branding`,
        {
          method: "PATCH",
          body: JSON.stringify({
            ...(draft.title !== saved.title ? { title: draft.title } : {}),
            ...(draft.logo !== saved.logo ? { logo: draft.logo } : {}),
          }),
        },
      );
      setTitle(data.title ?? "");
      setLogo(data.logo);
      onSaved(data);
      setStatus("Feedback branding saved.");
    } catch (cause) {
      setError(errorPresentation(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card booking-feedback-branding" onSubmit={save}>
      <h3 className="section-title">Feedback branding</h3>
      <div className="feedback-branding-preview">
        <span className="eyebrow">Passenger preview</span>
        <FeedbackBrandingHeader branding={draft} />
      </div>
      {editable && (
        <fieldset className="feedback-branding-fields" disabled={saving || reading}>
          <label className="field">
            Feedback title (optional)
            <input className="input" value={title} maxLength={120} placeholder="Journey feedback"
              onChange={event => { setTitle(event.target.value); setStatus(""); }} />
          </label>
          <label className="field">
            Client logo (optional)
            <input className="input" type="file" accept={logoTypes.join(",")} onChange={chooseLogo}
              aria-describedby="feedback-logo-help" />
            <small id="feedback-logo-help">{logoHelp}</small>
          </label>
          <div className="toolbar">
            <button className="button" disabled={!changed} type="submit">
              {saving ? "Saving…" : "Save feedback branding"}
            </button>
            {logo && <button className="button button-secondary" type="button"
              onClick={() => { setLogo(null); setStatus(""); setError(null); }}>
              Remove logo
            </button>}
          </div>
        </fieldset>
      )}
      {error && <ErrorAlert {...error} />}
      <span role="status">{status}</span>
    </form>
  );
}
