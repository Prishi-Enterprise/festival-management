import { notFound } from "next/navigation";
import { z } from "zod";
import { requireMember } from "@/lib/auth";
import { GuestPaymentForm } from "@/components/guest-payment-form";
import type { GuestDue, OperationsData } from "@/lib/operations";
import type { Account, Entry, Vendor } from "@/lib/finance";
export default async function GuestPayments({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ guest?: string; entry?: string; due?: string }>;
}) {
  const { id } = await params;
  const { guest, entry, due } = await searchParams;
  if (!z.uuid().safeParse(id).success) notFound();
  const { supabase, member } = await requireMember();
  const [data, accounts, receipt, vendors, dues] = await Promise.all([
    supabase.rpc("operations_data", { p_festival: id }),
    supabase.from("fund_accounts").select("*").eq("festival_id", id),
    entry && z.uuid().safeParse(entry).success
      ? supabase
          .from("finance_entries")
          .select("*,guest_receipt_links(guest_id)")
          .eq("id", entry)
          .eq("festival_id", id)
          .eq("created_by", member.user_id)
          .eq("status", "pending")
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("vendors").select("*").eq("festival_id", id),
    supabase.rpc("guest_due_report", { p_festival: id }),
  ]);
  if (
    data.error ||
    accounts.error ||
    receipt.error ||
    vendors.error ||
    dues.error
  )
    throw new Error("Could not load guest payments.");
  if (
    entry &&
    (!receipt.data ||
      receipt.data.kind !== "collection" ||
      receipt.data.category !== "Guest meals")
  )
    notFound();
  const dueEntry = (dues.data as GuestDue[]).find(
    (d) => d.id === due && d.created_by === member.user_id,
  );
  if (due && !dueEntry) notFound();
  const initialGuest =
    receipt.data?.guest_receipt_links?.guest_id ?? dueEntry?.id ?? guest;
  if (
    initialGuest &&
    !(data.data as OperationsData).guests.some((g) => g.id === initialGuest)
  )
    notFound();
  return (
    <GuestPaymentForm
      key={entry ?? due ?? guest ?? "new"}
      vendors={vendors.data as Vendor[]}
      dues={dues.data as GuestDue[]}
      dueEntry={dueEntry}
      userId={member.user_id}
      data={data.data as OperationsData}
      accounts={accounts.data as Account[]}
      entry={receipt.data as Entry | null}
      initialGuest={initialGuest}
    />
  );
}
