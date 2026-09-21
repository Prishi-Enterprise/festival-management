"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function FestivalNavigation({ admin }: { admin: boolean }) {
  const path = usePathname();
  const parts = path.split("/").filter(Boolean);
  if (parts[0] !== "desk" || !parts[1]) return null;
  const base = `/desk/${parts[1]}`;
  const links = [
    { href: base, label: "Financial entries" },
    { href: `${base}/payments`, label: "Fixed / meal-package payment" },
    { href: `${base}/guest-payments`, label: "Guest entries & payee dues" },
    { href: `${base}/attendance`, label: "Attendance & guests" },
    { href: `${base}/operations`, label: "Catering & events" },
    ...(admin ? [{ href: `${base}/report`, label: "Detailed reports" }] : []),
  ];
  return (
    <nav
      className="festival-navigation no-print"
      aria-label="Festival sections"
    >
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={path === link.href ? "page" : undefined}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
