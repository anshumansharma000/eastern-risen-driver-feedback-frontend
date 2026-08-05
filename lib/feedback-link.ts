import type { FeedbackLink } from "./contracts.ts";

export type FeedbackLinkAudience = "admin" | "driver";

export function feedbackLinkPath(audience: FeedbackLinkAudience, tripId: string) {
  return `/api/v1/${audience}/trips/${encodeURIComponent(tripId)}/feedback-link`;
}

export function passengerTokenFromSearch(search: string) {
  const token = new URLSearchParams(search).get("token")?.trim();
  return token || null;
}

export function feedbackLinkFromHandoff(data: {
  id: string;
  feedbackLink: string;
  feedbackAccessTokenExpiresAt: string;
}): FeedbackLink {
  return {
    tripId: data.id,
    feedbackLink: data.feedbackLink,
    feedbackAccessTokenExpiresAt: data.feedbackAccessTokenExpiresAt,
  };
}

export function isFeedbackLinkExpired(expiresAt: string, now = new Date()) {
  const expiry = Date.parse(expiresAt);
  return !Number.isFinite(expiry) || expiry <= now.getTime();
}

export function formatFeedbackLinkExpiry(expiresAt: string, locales?: Intl.LocalesArgument) {
  const expiry = new Date(expiresAt);
  if (Number.isNaN(expiry.getTime())) return "Expiration unavailable";
  return new Intl.DateTimeFormat(locales, { dateStyle: "medium", timeStyle: "short" }).format(expiry);
}

export async function copyFeedbackLink(feedbackLink: string, clipboard: Pick<Clipboard, "writeText">) {
  await clipboard.writeText(feedbackLink);
}

export async function shareFeedbackLink(feedbackLink: string, share: (data: ShareData) => Promise<void>) {
  try {
    await share({ title: "Passenger feedback", text: "Share feedback about your trip", url: feedbackLink });
    return "shared" as const;
  } catch (cause) {
    if (typeof cause === "object" && cause !== null && "name" in cause && cause.name === "AbortError") return "cancelled" as const;
    throw cause;
  }
}
