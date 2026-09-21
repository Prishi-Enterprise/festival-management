import { notFound } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { Brand } from "@/components/brand";
import { themeStyle } from "@/lib/societies";
import { ResidentRsvp } from "@/components/resident-rsvp";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Daily RSVP",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export default async function Page({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  if (!z.uuid().safeParse(code).success) notFound();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("resident_rsvp", { p_code: code });
  if (error) throw Error("Could not load RSVP.");
  if (!data) notFound();
  return (
    <main className="main-content" style={themeStyle(data.society.theme_color)}>
      <Brand society={data.society} />
      <h1>{data.festival} · Daily RSVP</h1>
      <p>
        Flat {data.flat} · contact ending {data.phone_hint}
      </p>
      <p>
        All {data.maximum} registered members are included by default. Change
        the count for any open day, including zero when nobody is attending.
      </p>
      <p className="small">
        Keep this link private: anyone with it can update this flat’s RSVP. This
        is a planning count; meal access still follows fixed-contribution and
        package eligibility.
      </p>
      <ResidentRsvp code={code} maximum={data.maximum} days={data.days} />
    </main>
  );
}
