import "server-only";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { isConfigured } from "@/lib/config";
import type { Member } from "@/lib/types";
import type { SocietyAccess } from "@/lib/societies";
export async function requireSocieties() {
  if (!isConfigured()) redirect("/setup");
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");
  const { data, error: accessError } = await supabase.rpc("my_societies");
  if (accessError) throw new Error("Could not load society access.");
  const access = data as SocietyAccess;
  if (!access.superadmin && !access.societies.length)
    redirect("/access-pending");
  return { supabase, user, access };
}
export async function requireMember(adminOnly = false) {
  const { user, access } = await requireSocieties();
  const selected = (await cookies()).get("festival-society")?.value;
  const society =
    access.societies.find((s) => s.id === selected) ??
    (!access.superadmin && access.societies.length === 1
      ? access.societies[0]
      : undefined);
  if (!society) redirect("/societies");
  const supabase = await createClient(society.id);
  const { data: actual, error } = await supabase
    .from("society_memberships")
    .select("*")
    .eq("user_id", user.id)
    .eq("society_id", society.id)
    .maybeSingle();
  if (error) throw new Error("Could not load membership.");
  const member: Member = access.superadmin
    ? {
        user_id: user.id,
        email: user.email!,
        display_name: user.user_metadata.full_name ?? "",
        role: "admin",
        can_view_reports: true,
        active: true,
        version: actual?.version ?? 1,
      }
    : actual;
  if (!member?.active) redirect("/access-pending");
  if (adminOnly && member.role !== "admin") redirect("/desk");
  return { supabase, member, society, superadmin: access.superadmin };
}
