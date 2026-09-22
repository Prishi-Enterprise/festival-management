import { notFound } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { appUrl } from "@/lib/config";
import { Brand } from "@/components/brand";
import { themeStyle } from "@/lib/societies";
import { PassQr } from "@/components/pass-qr";
import { PrintButton } from "@/components/print-button";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Resident meal pass",
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
  const { data: p, error } = await supabase.rpc("resident_pass", {
    p_code: code,
  });
  if (error) throw Error("Could not load resident pass.");
  if (!p) notFound();
  return (
    <main className="main-content" style={themeStyle(p.society.theme_color)}>
      <Brand society={p.society} />
      <section className="panel">
        <h1>{p.festival} · Resident pass</h1>
        <h2>Flat {p.flat}</h2>
        <p>{p.registered} registered members</p>
        <p>
          {p.eligible
            ? "Fixed contribution confirmed. Meal-package access follows confirmed package payments."
            : "Awaiting confirmed fixed contribution. Admission is not yet available."}
        </p>
        <PassQr url={`${appUrl()}/resident-pass/${code}`} />
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date / meal</th>
                <th>Eligible</th>
                <th>Checked in</th>
              </tr>
            </thead>
            <tbody>
              {p.meals.map(
                (m: {
                  date: string;
                  meal: string;
                  eligible: number;
                  attended: number;
                }) => (
                  <tr key={`${m.date}-${m.meal}`}>
                    <td>
                      {m.date} · {m.meal}
                    </td>
                    <td>{m.eligible}</td>
                    <td>{m.attended}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
        <p>
          Keep this pass within your household. Sharing or rescanning it does
          not increase the meal allowance. Committee members confirm each
          admission.
        </p>
        <PrintButton />
      </section>
    </main>
  );
}
