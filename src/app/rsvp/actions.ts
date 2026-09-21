"use server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
export async function saveRsvp(input: unknown) {
  const p = z
    .object({
      code: z.uuid(),
      date: z.iso.date(),
      attendees: z.number().int().min(0).max(100),
      version: z.number().int().min(0),
    })
    .safeParse(input);
  if (!p.success) return { ok: false, error: "Check the RSVP count." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_resident_rsvp", {
    p_code: p.data.code,
    p_date: p.data.date,
    p_attendees: p.data.attendees,
    p_version: p.data.version,
  });
  if (error)
    return {
      ok: false,
      error: error.code === "P0001" ? error.message : "Could not save RSVP.",
    };
  revalidatePath(`/rsvp/${p.data.code}`);
  revalidatePath("/desk", "layout");
  return { ok: true };
}
