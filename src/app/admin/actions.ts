"use server";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth";
import { blockSchema, festivalSchema, inviteSchema } from "@/lib/validation";
import { z } from "zod";
type Result = { ok: true; id?: string } | { ok: false; error: string };
async function perform(
  name: string,
  args: Record<string, unknown>,
): Promise<Result> {
  const { supabase } = await requireMember(true);
  const { data, error } = await supabase.rpc(name, args);
  if (error)
    return {
      ok: false,
      error:
        error.code === "P0001" ||
        error.code === "23505" ||
        error.code === "42501"
          ? error.message
          : "Could not save. Refresh and try again; check the database connection if this continues.",
    };
  revalidatePath("/admin", "layout");
  return { ok: true, id: typeof data === "string" ? data : undefined };
}
export async function saveFestival(input: unknown): Promise<Result> {
  const parsed = festivalSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0].message };
  return perform("save_festival", { p_input: parsed.data });
}
export async function saveBlock(input: unknown): Promise<Result> {
  const parsed = blockSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error:
        "Enter a block and comma-separated flat numbers (letters, numbers or hyphens).",
    };
  return perform("add_flats", {
    p_block: parsed.data.block,
    p_flats: parsed.data.flats,
  });
}
export async function inviteMember(input: unknown): Promise<Result> {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0].message };
  return perform("invite_member", {
    p_email: parsed.data.email,
    p_role: parsed.data.role,
    p_festival_ids: parsed.data.festival_ids,
  });
}
export async function revokeInvite(id: string): Promise<Result> {
  if (!z.uuid().safeParse(id).success)
    return { ok: false, error: "Invalid invitation." };
  return perform("revoke_invitation", { p_id: id });
}
export async function updateMember(input: unknown): Promise<Result> {
  const parsed = z
    .object({
      user_id: z.uuid(),
      role: z.enum(["admin", "committee"]),
      active: z.boolean(),
      version: z.number().int().positive(),
      festival_ids: z.array(z.uuid()).max(100),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid member settings." };
  return perform("update_member", { p_input: parsed.data });
}
