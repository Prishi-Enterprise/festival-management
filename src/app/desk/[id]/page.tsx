import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireMember } from "@/lib/auth";
import { PageHeading } from "@/components/page-heading";
import { FinanceDesk } from "@/components/finance-desk";
import type { Account, Entry, Overview, Vendor } from "@/lib/finance";
import type { Flat, Member } from "@/lib/types";
export default async function FestivalDesk({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { supabase, member } = await requireMember();
  const festival = await supabase
    .from("festivals")
    .select("id,name")
    .eq("id", id)
    .maybeSingle();
  if (festival.error) throw new Error("Could not load festival.");
  if (!festival.data) notFound();
  const [entries, accounts, vendors, overview, choices, people] =
    await Promise.all([
      supabase
        .from("finance_entries")
        .select("*")
        .eq("festival_id", id)
        .order("number", { ascending: false }),
      supabase
        .from("fund_accounts")
        .select("*")
        .eq("festival_id", id)
        .order("label"),
      supabase.from("vendors").select("*").eq("festival_id", id).order("name"),
      supabase.rpc("finance_overview", { p_festival: id }),
      supabase.rpc("finance_choices", { p_festival: id }),
      member.role === "admin"
        ? supabase.from("society_memberships").select("*").eq("active", true)
        : Promise.resolve({ data: [], error: null }),
    ]);
  if (
    [entries, accounts, vendors, overview, choices, people].some((r) => r.error)
  )
    throw new Error(
      "Could not load finance data. Verify the finance migration is installed.",
    );
  return (
    <>
      <PageHeading
        eyebrow="FESTIVAL ACCOUNTS"
        title={festival.data.name}
        description="Pending entries are provisional. Only admin-confirmed entries appear in approved totals."
        action={
          member.role === "admin" ? (
            <Link className="button secondary" href={`/desk/${id}/report`}>
              Detailed reports
            </Link>
          ) : undefined
        }
      />
      <FinanceDesk
        festivalId={id}
        member={member}
        entries={entries.data as Entry[]}
        accounts={accounts.data as Account[]}
        vendors={vendors.data as Vendor[]}
        overview={overview.data as Overview}
        flats={choices.data.flats as Flat[]}
        people={people.data as Member[]}
      />
    </>
  );
}
