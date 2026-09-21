import { requireSocieties } from "@/lib/auth";
import { SocietyManager } from "@/components/society-manager";
import { Brand } from "@/components/brand";
import { redirect } from "next/navigation";
export default async function Page() {
  const { access } = await requireSocieties();
  if (!access.superadmin && access.societies.length === 1) {
    redirect(access.societies[0].role === "admin" ? "/admin" : "/desk");
  }
  return (
    <div className="operations-shell society-shell">
      <header className="operations-header">
        <Brand />
        <form action="/auth/signout" method="post">
          <button className="text-button">Sign out</button>
        </form>
      </header>
      <main>
        <SocietyManager
          societies={access.societies}
          superadmin={access.superadmin}
        />
      </main>
    </div>
  );
}
