import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Eastern Risen Feedback",
    template: "%s · Eastern Risen",
  },
  description:
    "Passenger-safe trip feedback and operations for Eastern Risen Expedition Pvt. Ltd.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
