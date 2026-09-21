export const dynamic = "force-dynamic";
import { requireMember } from "@/lib/auth";
import { AuthFrame } from "@/components/auth-frame";
import { signOut } from "@/app/actions";
export default async function Committee() {
  const { supabase, member } = await requireMember();
  const { data, error } = await supabase.from("festivals").select("id,name");
  if (error) throw new Error("Could not load your assigned festivals.");
  return (
    <AuthFrame>
      <div className="auth-card">
        <span className="badge">Committee member</span>
        <h2>
          You’re on
          <br />
          the committee.
        </h2>
        <p className="muted">
          Signed in as {member.email}. Your access is ready. Collection and
          expense entry pages are coming in the next phase.
        </p>
        <h3>Your festivals</h3>
        {data?.length ? (
          <ul>
            {data.map((f) => (
              <li key={f.id}>{f.name}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">Your admin hasn’t assigned a festival yet.</p>
        )}
        <form action={signOut}>
          <button className="button secondary">Sign out</button>
        </form>
      </div>
    </AuthFrame>
  );
}
