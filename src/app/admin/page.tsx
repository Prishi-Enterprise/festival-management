import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  UsersRound,
  Building2,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { requireMember } from "@/lib/auth";
import { PageHeading } from "@/components/page-heading";
export default async function AdminHome() {
  const { supabase, member } = await requireMember(true);
  const [festivals, people, flats, invites] = await Promise.all([
    supabase
      .from("festivals")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(3),
    supabase
      .from("society_memberships")
      .select("*", { count: "exact", head: true })
      .eq("active", true),
    supabase.from("flats").select("*", { count: "exact", head: true }),
    supabase
      .from("member_invitations")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString()),
  ]);
  if ([festivals, people, flats, invites].some((r) => r.error))
    throw new Error(
      "Unable to load the workspace. Check the migration and connection.",
    );
  return (
    <>
      <PageHeading
        eyebrow="YOUR FESTIVAL WORKSPACE"
        title={`Welcome, ${member.display_name.split(" ")[0] || "admin"}.`}
        description="A little preparation. A wonderful celebration."
        action={
          <Link className="button" href="/admin/festivals/new">
            <Plus size={17} />
            Create festival
          </Link>
        }
      />
      <section className="hero-panel">
        <div>
          <span className="hero-tag">LET’S BRING EVERYONE TOGETHER</span>
          <h2>
            Every detail in place.
            <br />
            Every celebration, together.
          </h2>
          <p>
            Set up your festival, organize the flats and invite
            <br className="desktop-only" /> your committee. Start here,
            celebrate together.
          </p>
          <Link href="/admin/festivals" className="text-link">
            Manage festivals <ArrowRight size={16} />
          </Link>
        </div>
      </section>
      <section className="stats-grid">
        {[
          {
            label: "Festivals",
            count: festivals.count,
            icon: CalendarDays,
            note: "Created in your workspace",
          },
          {
            label: "Active members",
            count: people.count,
            icon: UsersRound,
            note: `${invites.count || 0} invitations awaiting sign-in`,
          },
          {
            label: "Registered flats",
            count: flats.count,
            icon: Building2,
            note: "Organized by block",
          },
        ].map(({ label, count, icon: Icon, note }) => (
          <div className="stat" key={label}>
            <div className="stat-label">
              {label}
              <Icon size={19} />
            </div>
            <strong>{count || 0}</strong>
            <small>{note}</small>
          </div>
        ))}
      </section>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="section-heading">
            <h2>Your festivals</h2>
            <Link href="/admin/festivals">
              View all <ArrowRight size={15} />
            </Link>
          </div>
          {festivals.data?.length ? (
            festivals.data.map((f) => (
              <Link
                className="list-row"
                key={f.id}
                href={`/admin/festivals/${f.id}`}
              >
                <span className="tile-icon">
                  <CalendarDays size={22} />
                </span>
                <div>
                  <strong>{f.name}</strong>
                  <small>
                    {f.day_count} days · {f.start_date}
                  </small>
                </div>
                <span className="badge">
                  {f.status === "ready" ? "Setup ready" : "Draft"}
                </span>
                <ArrowRight size={17} />
              </Link>
            ))
          ) : (
            <div className="empty-state">
              <CalendarDays size={34} strokeWidth={1.3} />
              <h3>Your next celebration starts here</h3>
              <p>
                Create a festival to set the calendar, contributions and
                committee.
              </p>
              <Link className="button secondary" href="/admin/festivals/new">
                Create your first festival <ArrowRight size={16} />
              </Link>
            </div>
          )}
        </section>
        <section className="panel getting-started">
          <p className="eyebrow">A SIMPLE START</p>
          <h2>Set the stage.</h2>
          <ol>
            <li>
              <span>01</span>
              <div>
                <strong>Create your festival</strong>
                <p>Choose dates and contributions.</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>Organize the flats</strong>
                <p>Add blocks and participating homes.</p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>Bring in your committee</strong>
                <p>Invite their email accounts.</p>
              </div>
            </li>
          </ol>
          <Link className="text-link" href="/admin/users">
            Manage people & access <ArrowRight size={16} />
          </Link>
        </section>
      </div>
      <p className="footnote">
        <ShieldCheck size={15} /> Open the Festival desk for collections,
        expense bills, confirmation and reports.
      </p>
    </>
  );
}
