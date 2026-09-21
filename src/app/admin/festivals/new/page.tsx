import { requireMember } from "@/lib/auth";
import { FestivalForm } from "@/components/festival-form";
import type { Flat, Member } from "@/lib/types";
export default async function NewFestival() {
  const { supabase } = await requireMember(true);
  const [flats, members] = await Promise.all([
    supabase.from("flats").select("*").order("block").order("flat_number"),
    supabase
      .from("society_memberships")
      .select("*")
      .eq("active", true)
      .order("email"),
  ]);
  if (flats.error || members.error)
    throw new Error("Could not load festival setup.");
  return (
    <FestivalForm
      flats={flats.data as Flat[]}
      members={members.data as Member[]}
      today={new Date().toLocaleDateString("en-CA", {
        timeZone: "Asia/Kolkata",
      })}
    />
  );
}
