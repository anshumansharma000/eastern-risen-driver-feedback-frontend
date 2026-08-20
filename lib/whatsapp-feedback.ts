import type { AdminFeedbackShare, FeedbackLink } from "./contracts.ts";
import { apiRequest } from "./api.ts";
import { feedbackLinkPath } from "./feedback-link.ts";

export const MISSING_PASSENGER_PHONE_MESSAGE = "Add a passenger phone number to this booking before sharing on WhatsApp.";

export function buildWhatsAppFeedbackMessage(recipientName: string, feedbackLink: string): string {
  return `Hi ${recipientName},\n\nThank you for travelling with Eastern Risen. We would appreciate your feedback about your recent trip.\n\nShare your feedback here: ${feedbackLink}`;
}

export function buildWhatsAppShareUrl(phone: string, message: string): string {
  const waNumber = phone.replace(/\D/g, "");
  return `https://wa.me/${waNumber ? waNumber : ""}?text=${encodeURIComponent(message)}`;
}

export function whatsappUrlFromFeedbackShare(share: AdminFeedbackShare): string | null {
  if (!share.recipient.phone) return null;
  return buildWhatsAppShareUrl(
    share.recipient.phone,
    buildWhatsAppFeedbackMessage(share.recipient.name, share.feedbackLink),
  );
}

type PlaceholderWindow = {
  closed: boolean;
  close: () => void;
  location: { href: string };
  opener: unknown;
};

type WhatsAppOpenDependencies = {
  request?: (path: string) => Promise<{ data: FeedbackLink | AdminFeedbackShare }>;
  open?: () => PlaceholderWindow | null;
  navigate?: (url: string) => void;
};

export async function openFeedbackOnWhatsApp(
  tripId: string,
  audience: "admin" | "driver",
  recipientName = "there",
  dependencies: WhatsAppOpenDependencies = {},
): Promise<"opened" | "missing-phone"> {
  const open = dependencies.open ?? (() => window.open("", "_blank") as PlaceholderWindow | null);
  const request = dependencies.request ?? ((path: string) => apiRequest<{ data: FeedbackLink | AdminFeedbackShare }>(path));
  const navigate = dependencies.navigate ?? ((url: string) => window.location.assign(url));
  const placeholder = open();
  if (placeholder) {
    try { placeholder.opener = null; } catch { /* Some browsers expose a read-only opener. */ }
  }
  try {
    const response = await request(feedbackLinkPath(audience, tripId));
    const share = response.data;
    const recipient = "recipient" in share ? share.recipient : null;
    if (audience === "admin" && recipient && !recipient.phone) {
      placeholder?.close();
      return "missing-phone";
    }
    const whatsappUrl = buildWhatsAppShareUrl(
      recipient?.phone ?? "",
      buildWhatsAppFeedbackMessage(recipient?.name ?? recipientName, share.feedbackLink),
    );
    if (placeholder && !placeholder.closed) placeholder.location.href = whatsappUrl;
    else navigate(whatsappUrl);
    return "opened";
  } catch (cause) {
    placeholder?.close();
    throw cause;
  }
}

export async function openAdminFeedbackOnWhatsApp(tripId: string, dependencies: WhatsAppOpenDependencies = {}): Promise<"opened" | "missing-phone"> {
  return openFeedbackOnWhatsApp(tripId, "admin", "there", dependencies);
}
