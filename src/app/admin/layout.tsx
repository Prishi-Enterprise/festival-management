import Link from "next/link";
import { themeStyle } from "@/lib/societies";
import { BackNavigation } from "@/components/back-navigation";
import { Brand } from "@/components/brand";
import { Nav } from "@/components/nav";
import { requireMember } from "@/lib/auth";
import { LogOut, ShieldCheck } from "lucide-react";
export const dynamic = "force-dynamic";
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { member, society, superadmin } = await requireMember(true);
  return (
    <div className="app-shell" style={themeStyle(society.theme_color)}>
      <aside className="sidebar">
        <Brand society={society} />
        <div className="workspace">
          <span className="workspace-avatar">{society.name.slice(0, 1)}</span>
          <div>
            <strong>{society.name}</strong>
            <small>Festival workspace</small>
          </div>
        </div>
        <p className="nav-label">WORKSPACE</p>
        <Nav />
        <Link className="nav-link" href="/societies">
          {superadmin ? "Manage societies" : "Switch society"}
        </Link>
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
            <form action="/auth/signout" method="post">
              <button className="icon-button" aria-label="Sign out">
                <LogOut size={18} />
              </button>
            </form>
          </div>
        </header>
        <main className="main-content">
          <BackNavigation />
          {children}
        </main>
        <footer className="app-footer">
          {society.name} · FESTIVAL DESK <span>Made for our community.</span>
        </footer>
      </div>
    </div>
  );
}
