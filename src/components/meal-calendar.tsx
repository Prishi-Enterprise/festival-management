"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveMealCalendar } from "@/app/admin/actions";
import { rupeesToPaise } from "@/lib/validation";
import type { Day } from "@/lib/types";
export type MealService = {
  id: string;
  service_date: string;
  meal: "breakfast" | "lunch" | "dinner";
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
  const [rows, setRows] = useState(() =>
    days.flatMap((d) =>
      (["breakfast", "lunch", "dinner"] as const).map((meal) => {
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
      <h2>Meal coverage by day</h2>
      <p className="muted">
        Choose fixed contribution or per-person package for each service. To
        include both lunch and dinner, set both rows. Package prices apply once
        per person across all selected services; children use the child package
        rate. Guest prices are separate per meal.
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
                r.coverage === "not_served" ? null : rupeesToPaise(guest),
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
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Day / date</th>
                  <th>Meal</th>
                  <th>Resident coverage</th>
                  <th>Guest / person (₹)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.service_date}-${r.meal}`}>
                    <td>
                      {
                        days.find((d) => d.service_date === r.service_date)
                          ?.label
                      }
                      <small>{r.service_date}</small>
                    </td>
                    <td>{r.meal}</td>
                    <td>
                      <select
                        aria-label={`${r.service_date} ${r.meal} coverage`}
                        value={r.coverage}
                        onChange={(e) =>
                          setRows(
                            rows.map((v, j) =>
                              j === i
                                ? {
                                    ...v,
                                    coverage: e.target
                                      .value as MealService["coverage"],
                                  }
                                : v,
                            ),
                          )
                        }
                      >
                        <option value="not_served">Not served</option>
                        <option value="fixed">Fixed flat contribution</option>
                        <option value="package">Per-person meal package</option>
                      </select>
                    </td>
                    <td>
                      <input
                        aria-label={`${r.service_date} ${r.meal} guest price`}
                        type="number"
                        min="0"
                        max="1000000"
                        step="0.01"
                        disabled={r.coverage === "not_served"}
                        value={r.guest}
                        onChange={(e) =>
                          setRows(
                            rows.map((v, j) =>
                              j === i ? { ...v, guest: e.target.value } : v,
                            ),
                          )
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="entry-actions">
            <button className="button" style={{ marginTop: 20 }}>
              Save meal calendar
            </button>
            <button
              className="button secondary"
              type="button"
              style={{ marginTop: 20 }}
              onClick={() =>
                setRows(
                  rows.map((r) => {
                    const d = days.find(
                      (d) => d.service_date === r.service_date,
                    )!;
                    return {
                      ...r,
                      coverage:
                        r.meal === "breakfast" ||
                        (d.day_number === 1 && r.meal === "dinner")
                          ? "fixed"
                          : r.meal === "dinner" &&
                              d.day_number >= 2 &&
                              d.day_number <= 9
                            ? "package"
                            : "not_served",
                    };
                  }),
                )
              }
            >
              Fill breakfast + dinner defaults
            </button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
