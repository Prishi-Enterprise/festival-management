"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth";
import { entrySchema } from "@/lib/finance";
const attendees = z
  .array(
    z.object({
      id: z.uuid(),
      name: z.string().trim().min(2).max(100),
      age_group: z.enum(["adult", "child", "under_seven"]),
    }),
  )
  .min(1)
  .max(100);
export async function saveFlatPayment(input: unknown) {
  const raw = z
    .object({ amount: z.number().int().min(0).max(100000000) })
    .passthrough()
    .safeParse(input);
  if (!raw.success)
    return { ok: false, error: "Enter a valid received amount." };
  const parsed = entrySchema.safeParse({
    ...raw.data,
    amount: raw.data.amount === 0 ? 1 : raw.data.amount,
  });
  const roster = z
    .object({
      contact_phone: z
        .string()
        .regex(/^\+[1-9][0-9]{7,14}$/)
        .optional(),
      members: attendees.optional(),
      member_ids: z.array(z.uuid()).max(100).default([]),
    })
    .safeParse(input);
  if (!parsed.success || !roster.success)
    return { ok: false, error: "Check payment fields and attendee names." };
  const { supabase } = await requireMember();
  const { error } = await supabase.rpc("save_flat_payment", {
    p_input: { ...parsed.data, ...roster.data, amount: raw.data.amount },
  });
  if (error)
    return {
      ok: false,
      error: ["P0001", "42501"].includes(error.code)
        ? error.message
        : "Could not save the payment. Refresh and check the selected flat/account.",
    };
  revalidatePath("/desk", "layout");
  return { ok: true };
}

export async function updateFlatContact(input: unknown) {
  const parsed = z
    .object({
      id: z.uuid(),
      phone: z.string().regex(/^\+[1-9][0-9]{7,14}$/),
      rotate: z.boolean(),
    })
    .safeParse(input);
  if (!parsed.success)
    return { ok: false, error: "Use a valid phone number with country code." };
  const { supabase } = await requireMember(true);
  const { error } = await supabase.rpc("update_flat_contact", {
    p_enrollment: parsed.data.id,
    p_phone: parsed.data.phone,
    p_rotate: parsed.data.rotate,
  });
  if (error)
    return {
      ok: false,
      error:
        error.code === "P0001" ? error.message : "Could not update contact.",
    };
  revalidatePath("/desk", "layout");
  return { ok: true };
}
