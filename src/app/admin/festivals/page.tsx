import Link from "next/link";
import { Plus, ArrowUpRight, CalendarDays } from "lucide-react";
import { requireMember } from "@/lib/auth";
import { PageHeading } from "@/components/page-heading";
import { BlockManager } from "@/components/block-manager";
import type { Flat } from "@/lib/types";
export default async function Festivals() {
  const { supabase } = await requireMember(true);
  const [festivals, flats] = await Promise.all([
    supabase
      .from("festivals")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase.from("flats").select("*").order("block").order("flat_number"),
  ]);
  if (festivals.error || flats.error)
    throw new Error("Could not load festivals.");
  return (
    <>
      <PageHeading
        eyebrow="PLAN THE CELEBRATION"
        title="Festivals"
        description="The calendar, the people and the little details that bring it all together."
        action={
          <Link href="/admin/festivals/new" className="button">
            <Plus size={17} />
            Create festival
          </Link>
        }
      />
      <div className="festival-grid">
        {festivals.data?.length ? (
          festivals.data.map((f) => (
            <Link
              href={`/admin/festivals/${f.id}`}
              className="festival-card"
              key={f.id}
            >
              <div className="card-top">
                <span className="tile-icon">
                  <CalendarDays size={23} />
                </span>
                <span
                  className={`badge ${f.status === "ready" ? "green" : ""}`}
                >
                  {f.status === "ready" ? "Setup ready" : "Draft"}
                </span>
              </div>
              <h2>{f.name}</h2>
              <p>
                {f.start_date} <span>·</span> {f.day_count} days
              </p>
              <div className="card-bottom">
                Manage festival <ArrowUpRight size={18} />
              </div>
            </Link>
          ))
        ) : (
          <section className="panel empty-state full-width">
            <CalendarDays size={36} strokeWidth={1.2} />
            <h2>A fresh calendar, a new celebration.</h2>
            <p>
              Start with your festival dates. You can save a draft and finish
              the setup later.
            </p>
            <Link href="/admin/festivals/new" className="text-link">
              Create a festival <ArrowUpRight size={17} />
            </Link>
          </section>
        )}
      </div>
      <BlockManager flats={flats.data as Flat[]} />
    </>
  );
}
