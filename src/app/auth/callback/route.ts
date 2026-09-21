import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { appUrl } from "@/lib/config";
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const supabase = await createClient();
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { error: claimError } = await supabase.rpc("claim_membership");
      if (!claimError) return NextResponse.redirect(`${appUrl()}/societies`);
      return NextResponse.redirect(`${appUrl()}/access-pending`);
    }
  }
  return NextResponse.redirect(`${appUrl()}/login?error=callback`);
}
