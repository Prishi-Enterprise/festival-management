import { requireMember } from "@/lib/auth";
import { appUrl } from "@/lib/config";
import { PageHeading } from "@/components/page-heading";
import { UserManager } from "@/components/user-manager";
import type { Member, Invitation, Festival } from "@/lib/types";
export default async function Users() {
  const { supabase } = await requireMember(true);
  const [members, invitations, festivals, assignments] = await Promise.all([
    supabase.from("society_memberships").select("*").order("created_at"),
    supabase
      .from("member_invitations")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("festivals")
      .select("*")
      .order("start_date", { ascending: false }),
    supabase.from("festival_memberships").select("*"),
  ]);
  if ([members, invitations, festivals, assignments].some((r) => r.error))
    throw new Error("Could not load people and access.");
  return (
    <>
      <PageHeading
        eyebrow="GOOD PEOPLE. GREAT CELEBRATIONS."
        title="People & access"
        description="Bring your committee together, with the right access for everyone."
      />
      <UserManager
        members={members.data as Member[]}
        invitations={invitations.data as Invitation[]}
        festivals={festivals.data as Festival[]}
        assignments={assignments.data!}
        now={requestTime()}
        loginUrl={`${appUrl()}/login`}
      />
    </>
  );
}

// This server-rendered snapshot is used only to label expired invitations.
function requestTime() {
  return Date.now();
}
