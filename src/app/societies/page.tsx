import { requireSocieties } from "@/lib/auth";
import { SocietyManager } from "@/components/society-manager";
import { Brand } from "@/components/brand";
export default async function Page() {
  const { access } = await requireSocieties();
  return (
    <div className="operations-shell">
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
