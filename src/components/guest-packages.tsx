"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveGuestPackage } from "@/app/admin/actions";
import { rupeesToPaise } from "@/lib/validation";
import type { GuestPackage } from "@/lib/operations";
import type { Day } from "@/lib/types";
import type { MealService } from "./meal-calendar";
import { inr } from "@/lib/finance";
export function GuestPackages({
  festivalId,
  days,
  services,
  packages,
}: {
  festivalId: string;
  days: Day[];
  services: MealService[];
  packages: GuestPackage[];
}) {
  const [editing, setEditing] = useState<GuestPackage | null>(null),
    [date, setDate] = useState(days[0]?.service_date ?? ""),
    [ids, setIds] = useState<string[]>([]),
    [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <section className="panel" id="guest-packages">
      <h2>Guest passes</h2>
      <p>
        Create a one-day pass with one price per guest and the included meals.
        Check-in is tracked separately at each meal. Existing issued passes keep
        their original meals and price when a package changes.
      </p>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      <form
        key={editing?.id ?? "new"}
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          start(async () => {
            try {
              const result = await saveGuestPackage({
                id: editing?.id ?? null,
                festival_id: festivalId,
                name: f.get("name"),
                service_date: date,
                price: rupeesToPaise(String(f.get("price"))),
                service_ids: ids,
                active: f.get("active") === "on",
                version: editing?.version ?? 0,
              });
              if (!result.ok) throw Error(result.error);
              setMessage("Guest package saved.");
              setEditing(null);
              setIds([]);
              router.refresh();
            } catch (error) {
              setMessage(
                error instanceof Error ? error.message : "Could not save.",
              );
            }
          });
        }}
      >
        <fieldset disabled={pending}>
          <legend>
            {editing ? "Edit guest package" : "Add guest package"}
          </legend>
          <div className="form-grid">
            <label>
              Pass name
              <input
                name="name"
                required
                maxLength={80}
                defaultValue={editing?.name ?? ""}
              />
            </label>
            <label>
              Day
              <select
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setIds([]);
                }}
              >
                {days.map((d) => (
                  <option value={d.service_date} key={d.service_date}>
                    {d.label} · {d.service_date}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Total price / guest (₹)
              <input
                name="price"
                type="number"
                required
                min="0"
                max="1000000"
                step="0.01"
                defaultValue={editing ? editing.price / 100 : ""}
              />
            </label>
          </div>
          <p>Included meals</p>
          <div className="meal-day-checkboxes">
            {services
              .filter((s) => s.service_date === date)
              .map((s) => (
                <label className="checkbox-row" key={s.id}>
                  <input
                    type="checkbox"
                    checked={ids.includes(s.id)}
                    onChange={(e) =>
                      setIds(
                        e.target.checked
                          ? [...ids, s.id]
                          : ids.filter((id) => id !== s.id),
                      )
                    }
                  />
                  {s.meal}
                </label>
              ))}
          </div>
          {!services.length && (
            <p>Save named meals in Resident coverage first.</p>
          )}
          <label className="checkbox-row">
            <input
              name="active"
              type="checkbox"
              defaultChecked={editing?.active ?? true}
            />
            Available for new guest entries
          </label>
          <div className="form-actions">
            <button className="button" disabled={!ids.length}>
              {pending ? "Saving…" : "Save guest package"}
            </button>
            {editing && (
              <button
                className="button secondary"
                type="button"
                onClick={() => {
                  setEditing(null);
                  setIds([]);
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </fieldset>
      </form>
      {packages.map((p) => (
        <article className="panel" key={p.id}>
          <h3>
            {p.name} · {inr(p.price)} / guest
          </h3>
          <p>
            {p.service_date} ·{" "}
            {p.service_ids
              .map((id) => services.find((s) => s.id === id)?.meal ?? "Meal")
              .join(" + ")}{" "}
            · {p.active ? "Available" : "Inactive"}
          </p>
          <button
            className="button secondary"
            onClick={() => {
              setEditing(p);
              setDate(p.service_date);
              setIds(p.service_ids);
              setMessage("");
            }}
          >
            Edit package
          </button>
        </article>
      ))}
    </section>
  );
}
