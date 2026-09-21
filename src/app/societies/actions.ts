"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSocieties } from "@/lib/auth";
export async function selectSociety(form: FormData) {
  const { access } = await requireSocieties();
  const id = String(form.get("society_id"));
  const society = access.societies.find((s) => s.id === id);
  if (!society) throw new Error("Society access required.");
  (await cookies()).set("festival-society", id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect(society.role === "admin" ? "/admin" : "/desk");
}
const schema = z.object({
  id: z.uuid().nullable(),
  name: z.string().trim().min(2).max(100),
  version: z.number().int().min(0),
  logo_url: z.string().nullable(),
  theme_color: z.string().regex(/^#[a-f0-9]{6}$/i),
});
export async function saveSociety(input: unknown) {
  const { supabase, access } = await requireSocieties();
  if (!access.superadmin)
    return { ok: false, error: "Super admin access required." };
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: "Check society name and branding." };
  const { error } = await supabase.rpc("save_society", {
    p_input: parsed.data,
  });
  if (error)
    return {
      ok: false,
      error: error.code === "P0001" ? error.message : "Could not save society.",
    };
  revalidatePath("/", "layout");
  return { ok: true };
}
export async function uploadSocietyLogo(form: FormData) {
  const { supabase, access } = await requireSocieties();
  if (!access.superadmin)
    return { ok: false, error: "Super admin access required." };
  const file = form.get("logo");
  if (
    !(file instanceof File) ||
    file.type !== "image/png" ||
    file.size > 131072
  )
    return { ok: false, error: "Choose a PNG logo up to 128 KB." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  if ([137, 80, 78, 71, 13, 10, 26, 10].some((b, i) => bytes[i] !== b))
    return { ok: false, error: "Invalid PNG image." };
  const name = `${crypto.randomUUID()}.png`;
  const { error } = await supabase.storage
    .from("society-logos")
    .upload(name, bytes, { contentType: "image/png", upsert: false });
  if (error) return { ok: false, error: "Logo upload failed. Please retry." };
  return { ok: true, path: `/storage/v1/object/public/society-logos/${name}` };
}
