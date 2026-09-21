import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isConfigured } from "@/lib/config";
import type { Member } from "@/lib/types";
export async function requireMember(adminOnly = false) {
  if (!isConfigured()) redirect("/setup");
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");
  const { data: member, error: memberError } = await supabase
    .from("society_memberships")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (memberError)
    throw new Error(
      "Could not load membership. Check the dev migration and connection.",
    );
  if (!member?.active) redirect("/access-pending");
  if (adminOnly && member.role !== "admin") redirect("/committee");
  return { supabase, member: member as Member };
}
