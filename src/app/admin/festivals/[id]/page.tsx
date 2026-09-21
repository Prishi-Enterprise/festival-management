import { notFound } from "next/navigation";
import { z } from "zod";
import { requireMember } from "@/lib/auth";
import { FestivalForm } from "@/components/festival-form";
import type { FestivalDetail, Flat, Member } from "@/lib/types";
export default async function FestivalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { supabase } = await requireMember(true);
  const [festival, flats, members] = await Promise.all([
    supabase.rpc("get_festival_detail", { p_id: id }),
    supabase.from("flats").select("*").order("block").order("flat_number"),
    supabase.from("society_memberships").select("*").order("email"),
  ]);
  if (festival.error || flats.error || members.error)
    throw new Error("Could not load festival settings.");
  if (!festival.data) notFound();
  return (
    <FestivalForm
      key={`${id}-${festival.data.version}`}
      festival={festival.data as FestivalDetail}
      flats={flats.data as Flat[]}
      members={members.data as Member[]}
      today={new Date().toISOString().slice(0, 10)}
    />
  );
}
