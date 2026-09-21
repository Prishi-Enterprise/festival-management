import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { PageHeading } from "@/components/page-heading";
export default async function Desk() {
  const { supabase, member } = await requireMember();
  const { data, error } = await supabase
    .from("festivals")
    .select("id,name,start_date,status")
    .order("start_date", { ascending: false });
  if (error) throw new Error("Could not load festivals.");
  return (
    <>
      <PageHeading
        eyebrow="FESTIVAL DESK"
        title="The everyday details"
        description="Record payments and bills, review entries and see where the festival stands."
      />
      <div className="festival-grid">
        {data?.map((f) => (
          <Link key={f.id} href={`/desk/${f.id}`} className="festival-card">
            <span className="badge">{f.status}</span>
            <h2>{f.name}</h2>
            <p>{f.start_date}</p>
            <span className="text-link">Open festival →</span>
          </Link>
        ))}
      </div>
      {!data?.length && (
        <section className="panel empty-state">
          <h2>No festivals assigned yet</h2>
          <p>
            {member.role === "admin"
              ? "Create a festival in Administration to get started."
              : "Ask your admin to assign your account to a festival."}
          </p>
        </section>
      )}
    </>
  );
}
