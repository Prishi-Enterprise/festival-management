import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { signOut } from "@/app/actions";
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
          <form action={signOut}>
            <button className="text-button">Sign out</button>
          </form>
        </nav>
      </header>
      <main>{children}</main>
    </div>
  );
}
