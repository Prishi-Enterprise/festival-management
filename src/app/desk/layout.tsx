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
  const { member } = await requireMember();
  return (
    <div className="operations-shell">
      <header className="operations-header">
        <Brand />
        <nav aria-label="Festival desk">
          <Link href="/desk">Festival desk</Link>
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
