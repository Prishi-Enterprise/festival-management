"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { saveMealCalendar, manageMeal } from "@/app/admin/actions";
import { rupeesToPaise } from "@/lib/validation";
import type { Day } from "@/lib/types";
export type MealService = {
  id: string;
  service_date: string;
  meal: string;
  coverage: "fixed" | "package" | "not_served";
  guest_rate: number | null;
  version: number;
};
export function MealCalendar({
  festivalId,
  days,
  services,
  defaultGuest,
}: {
  festivalId: string;
  days: Day[];
  services: MealService[];
  defaultGuest: number | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState("");
  const [newMeal, setNewMeal] = useState("");
  const [rows, setRows] = useState(() =>
    days.flatMap((d) =>
      [...new Set(services.map((s) => s.meal))].map((meal) => {
        const s = services.find(
          (s) => s.service_date === d.service_date && s.meal === meal,
        );
        return {
          service_date: d.service_date,
          meal,
          coverage: s?.coverage ?? "not_served",
          guest:
            s?.guest_rate == null && defaultGuest == null
              ? ""
              : String((s?.guest_rate ?? defaultGuest!) / 100),
          version: s?.version ?? 0,
        };
      }),
    ),
  );
  return (
    <section className="panel finance-register" id="meal-calendar">
      <h2>Resident coverage</h2>
      <p className="muted">
        Add named meals and choose days covered by the fixed contribution or
        resident meal package. Guest-pass prices and included meals are
        configured separately below.
      </p>
      <p className="small muted">
        Save festival dates first. Once a meal calendar is saved, its dates must
        remain in the festival calendar.
      </p>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <form
        action={() => {
          let values;
          try {
            values = rows.map(({ guest, ...r }) => ({
              ...r,
              guest_rate:
                r.coverage === "not_served"
                  ? null
                  : guest
                    ? rupeesToPaise(guest)
                    : null,
            }));
          } catch {
            setNotice("Enter valid guest prices in rupees.");
            return;
          }
          start(async () => {
            const result = await saveMealCalendar({
              festival_id: festivalId,
              services: values,
            });
            setNotice(result.ok ? "Meal coverage saved." : result.error);
            if (result.ok) router.refresh();
          });
        }}
      >
        <fieldset disabled={pending} style={{ border: 0, padding: 0 }}>
          <div className="meal-type-editor">
            <label>
              Meal name
              <input
                value={newMeal}
                maxLength={60}
                placeholder="e.g. Breakfast, Dinner, Prasad"
                onChange={(e) => setNewMeal(e.target.value)}
              />
            </label>
            <button
              className="button secondary"
              type="button"
              onClick={() => {
                const meal = newMeal.trim();
                if (!meal) {
                  setNotice("Enter a meal name.");
                  return;
                }
                if (
                  rows.some((r) => r.meal.toLowerCase() === meal.toLowerCase())
                ) {
                  setNotice("A meal with this name already exists.");
                  return;
                }
                if (new Set(rows.map((r) => r.meal)).size >= 20) {
                  setNotice("A festival can have up to 20 meals.");
                  return;
                }
                setRows(
                  [
                    ...rows,
                    ...days.map((d) => ({
                      service_date: d.service_date,
                      meal,
                      coverage: "not_served" as const,
                      guest:
                        defaultGuest == null ? "" : String(defaultGuest / 100),
                      version: 0,
                    })),
                  ].sort((a, b) =>
                    a.service_date.localeCompare(b.service_date),
                  ),
                );
                setNewMeal("");
                setNotice("");
              }}
            >
              Add meal
            </button>
          </div>
          <div className="meal-type-list">
            {[...new Set(rows.map((r) => r.meal))].map((meal) => (
              <span key={meal}>
                {meal}
                {!services.some((s) => s.meal === meal) && (
                  <button
                    type="button"
                    className="text-button"
                    aria-label={`Remove ${meal}`}
                    title={`Remove ${meal}`}
                    onClick={() => setRows(rows.filter((r) => r.meal !== meal))}
                  >
                    <Trash2 size={18} aria-hidden="true" />
                  </button>
                )}
              </span>
            ))}
          </div>
          <p className="small muted">
            Saved meals stay linked to their records. Set a meal to Not served
            on days when it is unavailable.
          </p>
          {rows.length === 0 && (
            <p>Add a meal to configure its daily coverage.</p>
          )}
          {[...new Set(rows.map((r) => r.meal))].map((meal) => (
            <section className="meal-coverage-card" key={meal}>
              <h3>{meal}</h3>
              {services.some((s) => s.meal === meal) && (
                <MealControls festivalId={festivalId} meal={meal} />
              )}
              <p className="small muted">
                Select days under each coverage. Selecting a day moves it from
                the other coverage; unselected days are not served.
              </p>
              <div className="meal-coverage-options">
                {(["fixed", "package"] as const).map((coverage) => {
                  return (
                    <fieldset key={coverage} className="meal-coverage-option">
                      <legend>
                        {coverage === "fixed"
                          ? "Fixed flat contribution"
                          : "Per-person meal package"}
                      </legend>
                      <div className="meal-day-checkboxes">
                        {days.map((day) => {
                          const row = rows.find(
                            (r) =>
                              r.meal === meal &&
                              r.service_date === day.service_date,
                          )!;
                          return (
                            <label
                              className="checkbox-row"
                              key={day.service_date}
                            >
                              <input
                                type="checkbox"
                                checked={row.coverage === coverage}
                                aria-label={`${meal} ${coverage} ${day.label} ${day.service_date}`}
                                onChange={(e) =>
                                  setRows(
                                    rows.map((r) =>
                                      r.meal === meal &&
                                      r.service_date === day.service_date
                                        ? {
                                            ...r,
                                            coverage: e.target.checked
                                              ? coverage
                                              : "not_served",
                                          }
                                        : r,
                                    ),
                                  )
                                }
                              />
                              <span>
                                {day.label}
                                <small>{day.service_date}</small>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </fieldset>
                  );
                })}
              </div>
              <details>
                <summary>Review daily resident coverage</summary>
                <ul className="meal-coverage-summary">
                  {rows
                    .filter((r) => r.meal === meal)
                    .map((r) => (
                      <li key={r.service_date}>
                        <strong>
                          {
                            days.find((d) => d.service_date === r.service_date)
                              ?.label
                          }
                        </strong>
                        <span>
                          {r.coverage === "fixed"
                            ? "Fixed flat contribution"
                            : r.coverage === "package"
                              ? "Per-person meal package"
                              : "Not served"}
                        </span>
                      </li>
                    ))}
                </ul>
              </details>
            </section>
          ))}
          <div className="entry-actions">
            <button
              className="button"
              disabled={rows.length === 0}
              style={{ marginTop: 20 }}
            >
              Save meal calendar
            </button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}

function MealControls({
  festivalId,
  meal,
}: {
  festivalId: string;
  meal: string;
}) {
  const [name, setName] = useState(meal),
    [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (next: string | null) =>
    start(async () => {
      const result = await manageMeal({
        festival_id: festivalId,
        meal,
        name: next,
      });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      router.refresh();
    });
  return (
    <div>
      <div className="meal-type-editor">
        <label>
          Meal name
          <input
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="button secondary"
          disabled={pending || name === meal}
          onClick={() => run(name)}
        >
          Rename
        </button>
        <button
          type="button"
          className="button secondary"
          disabled={pending}
          aria-label={`Remove ${meal}`}
          title={`Remove ${meal}`}
          onClick={() => {
            if (
              window.confirm(
                `Remove ${meal} from every day? Only unused meals can be removed.`,
              )
            )
              run(null);
          }}
        >
          <Trash2 size={18} aria-hidden="true" />
        </button>
      </div>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
    </div>
  );
}
