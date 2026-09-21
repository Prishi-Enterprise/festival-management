"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Building2 } from "lucide-react";
import { saveBlock, deactivateFlats } from "@/app/admin/actions";
import type { Flat } from "@/lib/types";
export function BlockManager({ flats }: { flats: Flat[] }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [showInactive, setShowInactive] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const blocks = [...new Set(flats.map((f) => f.block))].sort();
  const filtered = flats.filter(
    (f) =>
      (showInactive || f.active !== false) &&
      `${f.block} ${f.flat_number}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const current = Math.min(
    page,
    Math.max(0, Math.ceil(filtered.length / 10) - 1),
  );
  const deactivate = (ids: string[], label: string) => {
    if (
      !window.confirm(
        `Deactivate ${label}? Existing transactions and attendance remain linked. You can add a corrected record afterwards.`,
      )
    )
      return;
    setError("");
    setNotice("");
    start(async () => {
      const result = await deactivateFlats(ids);
      if (!result.ok) setError(result.error);
      else {
        setNotice(
          "Deactivated. Existing records remain linked; add corrected flats below.",
        );
        router.refresh();
      }
    });
  };
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
              {
                flats.filter((f) => f.block === block && f.active !== false)
                  .length
              }{" "}
              active flats
              <button
                type="button"
                className="text-button"
                disabled={
                  pending ||
                  !flats.some((f) => f.block === block && f.active !== false)
                }
                onClick={() =>
                  deactivate(
                    flats
                      .filter((f) => f.block === block && f.active !== false)
                      .map((f) => f.id),
                    `all active flats in block ${block}`,
                  )
                }
              >
                Deactivate block
              </button>
            </span>
          ))
        ) : (
          <p className="muted small">
            No flats yet. Add your first block below.
          </p>
        )}
      </div>
      <p className="small muted">
        Correct a mistake by deactivating the old flat or block, then adding the
        replacement. Historical entries stay on the old record.
      </p>
      <label>
        Search block or flat
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
      </label>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={showInactive}
          onChange={(e) => {
            setShowInactive(e.target.checked);
            setPage(0);
          }}
        />
        Show inactive records
      </label>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Block</th>
              <th>Flat</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(current * 10, current * 10 + 10).map((f) => (
              <tr key={f.id}>
                <td>{f.block}</td>
                <td>{f.flat_number}</td>
                <td>{f.active === false ? "Inactive" : "Active"}</td>
                <td>
                  {f.active !== false && (
                    <button
                      type="button"
                      className="button secondary small-button"
                      disabled={pending}
                      onClick={() =>
                        deactivate([f.id], `${f.block}–${f.flat_number}`)
                      }
                    >
                      Deactivate
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="form-actions">
        <button
          type="button"
          className="button secondary"
          disabled={current === 0}
          onClick={() => setPage(current - 1)}
        >
          Previous
        </button>
        <span>
          {filtered.length ? current * 10 + 1 : 0}–
          {Math.min((current + 1) * 10, filtered.length)} of {filtered.length}
        </span>
        <button
          type="button"
          className="button secondary"
          disabled={(current + 1) * 10 >= filtered.length}
          onClick={() => setPage(current + 1)}
        >
          Next
        </button>
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
            Separate with commas. Active flats won’t be duplicated. Inactive
            numbers can be added as new records.
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
