/* eslint-disable @next/next/no-img-element */
import type { Society } from "@/lib/societies";
import { logoSrc } from "@/lib/societies";
export function Brand({ society }: { society?: Society }) {
  const src = logoSrc(
    society?.logo_url ?? null,
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  );
  return (
    <div className="brand">
      {src ? (
        <img
          className="brand-logo"
          src={src}
          width={52}
          height={54}
          alt={`${society?.name} logo`}
        />
      ) : (
        <span className="workspace-avatar brand-initial">
          {(society?.name ?? "Festivals").slice(0, 1).toUpperCase()}
        </span>
      )}
      <div>
        <strong>{society?.name ?? "Festivals"}</strong>
        <span>FESTIVAL DESK</span>
      </div>
    </div>
  );
}
