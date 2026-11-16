import type { Metadata } from "next";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: { absolute: "Journey feedback" },
  description: "Share feedback about your travel experience.",
  icons: {
    icon: { url: `${basePath}/feedback-icon.svg`, type: "image/svg+xml" },
    shortcut: `${basePath}/feedback-icon.svg`,
  },
};

export default function FeedbackLayout({ children }: { children: React.ReactNode }) {
  return children;
}
