import { notFound } from "next/navigation";
import { z } from "zod";
import { requireMember } from "@/lib/auth";
import { FlatPaymentForm } from "@/components/flat-payment-form";
import type { OperationsData } from "@/lib/operations";
import type { Account, Entry } from "@/lib/finance";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ entry?: string }>;
}) {
  const { id } = await params;
  const { entry } = await searchParams;
  if (!z.uuid().safeParse(id).success) notFound();
  const { supabase, member } = await requireMember();
  const [data, accounts, receipt] = await Promise.all([
    supabase.rpc("operations_data", { p_festival: id }),
    supabase.from("fund_accounts").select("*").eq("festival_id", id),
    entry && z.uuid().safeParse(entry).success
      ? supabase
          .from("finance_entries")
          .select("*")
          .eq("id", entry)
          .eq("festival_id", id)
          .eq("created_by", member.user_id)
          .eq("status", "pending")
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (data.error || accounts.error || receipt.error)
    throw new Error("Could not load flat payments.");
  if (entry && !receipt.data) notFound();
  return (
    <FlatPaymentForm
      key={entry ?? "new"}
      data={data.data as OperationsData}
      accounts={accounts.data as Account[]}
      entry={receipt.data as Entry | null}
    />
  );
}
