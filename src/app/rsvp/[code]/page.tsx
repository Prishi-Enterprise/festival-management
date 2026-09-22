import { PassQr } from "@/components/pass-qr";
import { appUrl } from "@/lib/config";
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
      {data.attendance_code && (
        <section className="panel resident-rsvp-pass">
          <h2>Your household attendance pass</h2>
          <p>
            Bring this QR to the meal entrance. One QR covers all registered
            members of this flat across eligible meals; the committee selects
            the day and meal when checking you in.
          </p>
          <p className="notice">
            {data.eligible
              ? "Fixed contribution confirmed. Package meals additionally require confirmed package payment."
              : "Awaiting confirmed fixed contribution. This QR does not enable admission until payment is confirmed."}
          </p>
          <PassQr url={`${appUrl()}/resident-pass/${data.attendance_code}`} />
          <div className="form-actions">
            <a
              className="button secondary"
              href={`${appUrl()}/resident-pass/${data.attendance_code}`}
              target="_blank"
              rel="noreferrer"
            >
              Open / print attendance pass
            </a>
          </div>
          <p className="tiny">
            RSVP helps plan meal quantities. Changing RSVP does not replace this
            QR or record attendance. Share the attendance pass when needed, and
            keep this RSVP editing link private.
          </p>
        </section>
      )}
      <ResidentRsvp code={code} maximum={data.maximum} days={data.days} />
    </main>
  );
}
