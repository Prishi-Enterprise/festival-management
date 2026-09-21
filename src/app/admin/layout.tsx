import { Brand } from "@/components/brand";
import { Nav } from "@/components/nav";
import { requireMember } from "@/lib/auth";
import { signOut } from "@/app/actions";
import { LogOut, ShieldCheck } from "lucide-react";
export const dynamic = "force-dynamic";
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { member } = await requireMember(true);
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <div className="workspace">
          <span className="workspace-avatar">R</span>
          <div>
            <strong>Radhe Society</strong>
            <small>Festival workspace</small>
          </div>
        </div>
        <p className="nav-label">WORKSPACE</p>
        <Nav />
        <div className="sidebar-bottom">
          <div className="admin-marker">
            <ShieldCheck size={17} /> Administrator
          </div>
          <p>
            Good celebrations start
            <br />
            with thoughtful preparation.
          </p>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <span className="breadcrumb">
            Workspace <span>/</span> Administration
          </span>
          <div className="topbar-user">
            <span className="env-label">
              {process.env.NEXT_PUBLIC_APP_ENV === "prod"
                ? "Production"
                : "Development"}
            </span>
            <span className="avatar" title={member.email}>
              {(member.display_name || member.email).slice(0, 1).toUpperCase()}
            </span>
            <form action={signOut}>
              <button className="icon-button" aria-label="Sign out">
                <LogOut size={18} />
              </button>
            </form>
          </div>
        </header>
        <main className="main-content">{children}</main>
        <footer className="app-footer">
          RADHE FESTIVAL DESK <span>Made for our community.</span>
        </footer>
      </div>
    </div>
  );
}
