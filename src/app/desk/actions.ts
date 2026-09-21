"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth";
import { entrySchema } from "@/lib/finance";
export type FinanceResult = { ok: boolean; error?: string };
async function run(
  name: string,
  args: Record<string, unknown>,
): Promise<FinanceResult> {
  const { supabase } = await requireMember();
  const { error } = await supabase.rpc(name, args);
  if (error)
    return {
      ok: false,
      error: ["P0001", "42501", "23505"].includes(error.code)
        ? error.message
        : "Check the amount, required fields and selected accounts, then try again.",
    };
  revalidatePath("/desk", "layout");
  return { ok: true };
}
export async function saveEntry(input: unknown) {
  const p = entrySchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  return run("save_finance_entry", { p_input: p.data });
}
export async function reviewEntry(input: unknown) {
  const p = z
    .object({
      id: z.uuid(),
      version: z.number().int().positive(),
      action: z.enum(["confirm", "unlock", "void"]),
      reason: z.string().max(300),
    })
    .safeParse(input);
  if (!p.success) return { ok: false, error: "Invalid review request." };
  return run("review_finance_entry", {
    p_id: p.data.id,
    p_version: p.data.version,
    p_action: p.data.action,
    p_reason: p.data.reason,
  });
}
export async function createResource(input: unknown) {
  const p = z
    .discriminatedUnion("kind", [
      z.object({
        kind: z.literal("account"),
        id: z.uuid(),
        festival_id: z.uuid(),
        label: z.string().trim().min(2).max(100),
        method: z.enum(["cash", "online"]),
        holder_id: z.uuid(),
      }),
      z.object({
        kind: z.literal("vendor"),
        id: z.uuid(),
        festival_id: z.uuid(),
        label: z.string().trim().min(2).max(100),
      }),
    ])
    .safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  return run("create_finance_resource", { p_input: p.data });
}
