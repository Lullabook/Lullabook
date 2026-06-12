import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Lullabook", template: "%s · Lullabook" },
  description:
    "AI storybooks starring your baby and family — written and illustrated for bedtime.",
};

export const viewport: Viewport = {
  themeColor: "#14112b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
