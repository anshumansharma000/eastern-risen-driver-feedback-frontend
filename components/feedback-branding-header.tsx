import type { FeedbackBranding } from "@/lib/contracts";

export function FeedbackBrandingHeader({ branding }: { branding?: FeedbackBranding }) {
  const title = branding?.title || "Journey feedback";
  return (
    <div className="feedback-branding-header">
      {branding?.logo && (
        // eslint-disable-next-line @next/next/no-img-element -- Uploaded logo is already sized and encoded by the API.
        <img className="feedback-branding-logo" src={branding.logo} alt="Travel provider logo" />
      )}
      <strong>{title}</strong>
    </div>
  );
}
