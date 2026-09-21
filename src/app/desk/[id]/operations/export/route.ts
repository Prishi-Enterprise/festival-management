import { requireMember } from "@/lib/auth";
import { csvCell } from "@/lib/finance";
import { type OperationsData } from "@/lib/operations";
import { z } from "zod";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success)
    return new Response("Invalid festival", { status: 400 });
  const { supabase, member } = await requireMember();
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  const event = url.searchParams.get("id");
  if (!["events", "catering"].includes(kind ?? ""))
    return new Response("Invalid report", { status: 400 });
  if (kind === "catering" && member.role !== "admin")
    return new Response("Admin access required", { status: 403 });
  const { data, error } = await supabase.rpc("operations_data", {
    p_festival: id,
  });
  if (error) return new Response("Could not export", { status: 500 });
  const d = data as OperationsData;
  const rows: unknown[][] = [[d.festival.name, kind, "As of", d.as_of]];
  if (kind === "events") {
    rows.push([
      "Event",
      "Date",
      "Flat",
      "Name",
      "Category",
      "Other category",
      "Sequence",
      "Theme",
      "Notes",
      "Attended",
      "Cancelled",
    ]);
    for (const p of d.participants.filter(
      (p) => !event || p.event_id === event,
    )) {
      const e = d.events.find((e) => e.id === p.event_id);
      const f = d.flats.find((f) => f.id === p.flat_id);
      rows.push([
        e?.title,
        e?.service_date,
        f ? `${f.block}-${f.flat_number}` : "",
        p.name,
        p.category,
        p.category_other,
        p.sequence,
        p.theme,
        p.note,
        p.attended,
        p.cancelled,
      ]);
    }
  } else {
    rows.push([
      "Date",
      "Meal",
      "Supplier",
      "Ordered",
      "Served",
      "Billed plates",
      "Rate INR",
      "Extras INR",
      "Bill status",
      "Bill INR",
      "Allocated INR",
    ]);
    for (const c of d.catering ?? []) {
      const s = d.services.find((s) => s.id === c.service_id);
      const b = d.finance?.find((e) => e.id === c.bill_id);
      rows.push([
        s?.service_date,
        s?.meal,
        d.vendors?.find((v) => v.id === c.vendor_id)?.name,
        c.ordered,
        c.served,
        c.billed,
        c.unit_rate / 100,
        c.extras / 100,
        b?.status,
        (b?.amount ?? 0) / 100,
        (d.allocations ?? [])
          .filter((a) => a.catering_id === c.id)
          .reduce((n, a) => n + a.amount, 0) / 100,
      ]);
    }
  }
  return new Response(
    "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n"),
    {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="festival-${kind}.csv"`,
        "Cache-Control": "private, no-store",
      },
    },
  );
}
