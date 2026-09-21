import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "Festivals · Prishi", template: "%s · Festivals" },
  description: "A shared home for festival preparations.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
