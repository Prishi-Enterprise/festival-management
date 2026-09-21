"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { appUrl, isConfigured } from "@/lib/config";
export async function signIn() {
  if (!isConfigured()) redirect("/setup");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${appUrl()}/auth/callback`,
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data.url) redirect("/login?error=provider");
  redirect(data.url);
}
export async function signOut() {
  if (isConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
