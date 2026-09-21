"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, LayoutGrid } from "lucide-react";

export function BackNavigation() {
  const path = usePathname();
  const parts = path.split("/").filter(Boolean);
  let back: { href: string; label: string } | null = null;
  if (parts[0] === "desk" && parts.length > 2) {
    back = { href: `/desk/${parts[1]}`, label: "Back to festival" };
  } else if (parts[0] === "desk" && parts.length === 2) {
    back = { href: "/desk", label: "Back to festivals" };
  } else if (
    parts[0] === "admin" &&
    parts[1] === "festivals" &&
    parts.length > 2
  ) {
    back = { href: "/admin/festivals", label: "Back to festivals" };
  } else if (parts[0] === "admin" && parts.length > 1) {
    back = { href: "/admin", label: "Back to overview" };
  }
  if (path === "/desk") return null;
  return (
    <nav className="back-navigation no-print" aria-label="Page navigation">
      {back && (
        <Link href={back.href}>
          <ArrowLeft size={20} aria-hidden="true" />
          {back.label}
        </Link>
      )}
      {back?.href !== "/desk" && (
        <Link href="/desk">
          <LayoutGrid size={19} aria-hidden="true" />
          All festivals
        </Link>
      )}
    </nav>
  );
}
