import { themeStyle } from "@/lib/societies";
import { FestivalNavigation } from "@/components/festival-navigation";
import { BackNavigation } from "@/components/back-navigation";
import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { Brand } from "@/components/brand";
export const dynamic = "force-dynamic";
export default async function DeskLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { member, society, superadmin, canSwitchSociety } =
    await requireMember();
  return (
    <div className="operations-shell" style={themeStyle(society.theme_color)}>
      <header className="operations-header">
        <Brand society={society} />
        <nav aria-label="Festival desk">
          <Link href="/desk">Festival desk</Link>
          {canSwitchSociety && (
            <Link href="/societies">
              {superadmin ? "Manage societies" : "Switch society"}
            </Link>
          )}
          {member.role === "admin" && <Link href="/admin">Administration</Link>}
          <form action="/auth/signout" method="post">
            <button className="text-button">Sign out</button>
          </form>
        </nav>
      </header>
      <main>
        <div className="desk-navigation no-print">
          <BackNavigation />
          <FestivalNavigation admin={member.role === "admin"} />
        </div>
        {children}
      </main>
    </div>
  );
}
