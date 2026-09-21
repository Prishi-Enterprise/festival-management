"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, CalendarDays, UsersRound } from "lucide-react";
const links = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/festivals", label: "Festivals", icon: CalendarDays },
  { href: "/admin/users", label: "People & access", icon: UsersRound },
];
export function Nav() {
  const path = usePathname();
  return (
    <nav aria-label="Admin navigation">
      {links.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={
            path === href || (href !== "/admin" && path.startsWith(href))
              ? "nav-link active"
              : "nav-link"
          }
          aria-current={path === href ? "page" : undefined}
        >
          <Icon size={19} />
          {label}
        </Link>
      ))}
    </nav>
  );
}
