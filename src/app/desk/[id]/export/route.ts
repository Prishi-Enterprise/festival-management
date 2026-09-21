import { requireMember } from "@/lib/auth";
import { csvCell, kindLabels, type FinanceReport } from "@/lib/finance";
import { z } from "zod";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success)
    return new Response("Invalid festival", { status: 400 });
  const { supabase } = await requireMember(true);
  const { data, error } = await supabase.rpc("finance_report", {
    p_festival: id,
  });
  if (error) return new Response("Could not export report", { status: 500 });
  const r = data as FinanceReport;
  const account = (id: string | null) =>
    r.accounts.find((a) => a.id === id)?.label ?? "";
  const flat = (id: string | null) => {
    const f = r.flats.find((f) => f.id === id);
    return f ? `${f.block}-${f.flat_number}` : "";
  };
  const rows: unknown[][] = [
    [r.festival_name + " accounts", "As of (UTC)", r.as_of],
    ["Summary (confirmed only)", "INR"],
    ...Object.entries(r.overview)
      .filter(([k]) => k !== "pending")
      .map(([k, v]) => [k, (Number(v) / 100).toFixed(2)]),
    ["Pending entries excluded", r.overview.pending],
    [],
    [
      "No.",
      "Date",
      "Type",
      "Description",
      "Category",
      "Other category",
      "Reference",
      "Flat",
      "Payee",
      "Account",
      "Destination",
      "Amount INR",
      "Status",
      "Revision",
      "Creator ID",
    ],
  ];
  for (const e of r.entries)
    rows.push([
      e.number,
      e.occurred_on,
      kindLabels[e.kind],
      e.description,
      e.category,
      e.category_other,
      e.reference,
      flat(e.flat_id),
      r.vendors.find((v) => v.id === e.vendor_id)?.name ?? "",
      account(e.account_id),
      account(e.to_account_id),
      (e.amount / 100).toFixed(2),
      e.status,
      e.version,
      e.created_by,
    ]);
  rows.push([], ["Account", "Holder", "Method", "Balance INR"]);
  for (const a of r.accounts)
    rows.push([
      a.label,
      a.display_name || a.email,
      a.method,
      (a.balance / 100).toFixed(2),
    ]);
  rows.push([], ["Payee", "Billed INR", "Paid INR", "Payable / advance INR"]);
  for (const v of r.vendors)
    rows.push([
      v.name,
      (v.billed / 100).toFixed(2),
      (v.paid / 100).toFixed(2),
      ((v.billed - v.paid) / 100).toFixed(2),
    ]);
  rows.push(
    [],
    ["Flat", "Charged INR", "Net received INR", "Due / credit INR"],
  );
  for (const f of r.flats)
    rows.push([
      `${f.block}-${f.flat_number}`,
      (f.charged / 100).toFixed(2),
      (f.paid / 100).toFixed(2),
      ((f.charged - f.paid) / 100).toFixed(2),
    ]);
  return new Response(
    "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n"),
    {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="festival-${id}-accounts.csv"`,
        "Cache-Control": "private, no-store",
      },
    },
  );
}
