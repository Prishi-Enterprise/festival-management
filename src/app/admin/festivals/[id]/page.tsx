import { notFound } from "next/navigation";
import { z } from "zod";
import { requireMember } from "@/lib/auth";
import { MealCalendar, type MealService } from "@/components/meal-calendar";
import { GuestPackages } from "@/components/guest-packages";
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
  const [festival, flats, members, meals, packages] = await Promise.all([
    supabase.rpc("get_festival_detail", { p_id: id }),
    supabase.from("flats").select("*").order("block").order("flat_number"),
    supabase.from("society_memberships").select("*").order("email"),
    supabase.from("meal_services").select("*").eq("festival_id", id),
    supabase.from("guest_packages").select("*").eq("festival_id", id),
  ]);
  if (
    festival.error ||
    flats.error ||
    members.error ||
    meals.error ||
    packages.error
  )
    throw new Error("Could not load festival settings.");
  if (!festival.data) notFound();
  return (
    <>
      {" "}
      <FestivalForm
        key={`${id}-${festival.data.version}`}
        festival={festival.data as FestivalDetail}
        flats={flats.data as Flat[]}
        members={members.data as Member[]}
        today={new Date().toISOString().slice(0, 10)}
      />
      <MealCalendar
        key={JSON.stringify(meals.data) + festival.data.version}
        festivalId={id}
        days={festival.data.days}
        services={meals.data as MealService[]}
      />
      <GuestPackages
        festivalId={id}
        days={festival.data.days}
        services={meals.data as MealService[]}
        packages={packages.data ?? []}
      />
    </>
  );
}
