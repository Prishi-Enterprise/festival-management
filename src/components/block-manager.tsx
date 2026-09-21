"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Building2 } from "lucide-react";
import { saveBlock } from "@/app/admin/actions";
import type { Flat } from "@/lib/types";
export function BlockManager({ flats }: { flats: Flat[] }) {
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const blocks = [...new Set(flats.map((f) => f.block))].sort();
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <h2>Blocks & flats</h2>
          <p className="muted small">
            Your reusable society register. Choose participating flats in each
            festival.
          </p>
        </div>
        <Building2 size={22} />
      </div>
      <div className="block-summary">
        {blocks.length ? (
          blocks.map((block) => (
            <span className="block-chip" key={block}>
              <strong>Block {block}</strong>
              {flats.filter((f) => f.block === block).length} flats
            </span>
          ))
        ) : (
          <p className="muted small">
            No flats yet. Add your first block below.
          </p>
        )}
      </div>
      <form
        className="block-form"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          setError("");
          setNotice("");
          start(async () => {
            const result = await saveBlock({
              block: data.get("block"),
              flats: String(data.get("flats"))
                .split(/[\s,]+/)
                .filter(Boolean),
            });
            if (!result.ok) setError(result.error);
            else {
              form.reset();
              setNotice(
                "Flats added to your society register. Existing flats were kept.",
              );
              router.refresh();
            }
          });
        }}
      >
        <label>
          Block
          <input name="block" placeholder="A" required maxLength={12} />
        </label>
        <label>
          Flat numbers
          <input name="flats" placeholder="101, 102, 103, 201, 202" required />
          <small>
            Separate with commas. Existing flats won’t be duplicated.
          </small>
        </label>
        <button className="button secondary" disabled={pending}>
          <Plus size={16} />
          {pending ? "Adding…" : "Add flats"}
        </button>
      </form>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice success" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
