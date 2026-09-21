import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "Radhe · Festival desk", template: "%s · Radhe" },
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
