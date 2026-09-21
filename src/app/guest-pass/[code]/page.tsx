import { Brand } from "@/components/brand";
import { themeStyle } from "@/lib/societies";
import { notFound } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "@/components/print-button";
export const dynamic = "force-dynamic";
export const metadata = {
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
  const { data: p, error } = await supabase.rpc("guest_pass", { p_code: code });
  if (error) throw new Error("Could not load pass.");
  if (!p) notFound();
  return (
    <main className="main-content" style={themeStyle(p.society.theme_color)}>
      <Brand society={p.society} />
      <section className="panel">
        <h1>{p.festival} · Guest pass</h1>
        <h2>
          {p.date} · {p.meal}
        </h2>
        <p>
          {p.count} guests · {p.attended} admitted ·{" "}
          {p.cancelled ? 0 : Math.max(0, p.count - p.attended)} remaining
        </p>
        <p>
          <strong>
            {p.cancelled
              ? "Cancelled"
              : "Show this pass to the committee at the meal entrance."}
          </strong>
        </p>
        <p>Pass code: {p.code}</p>
        <p>
          This pass is valid only for the meal above. Admission is recorded by
          the committee; sharing it does not increase its guest allowance.
        </p>
        <PrintButton />
      </section>
    </main>
  );
}
