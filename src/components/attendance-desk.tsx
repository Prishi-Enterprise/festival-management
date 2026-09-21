"use client";
import Link from "next/link";
import { useState } from "react";
import { OperationForm, type Field } from "./operation-form";
import {
  mealTotal,
  serviceLabel,
  type OperationsData,
  type Guest,
} from "@/lib/operations";
import type { Member } from "@/lib/types";
export function AttendanceDesk({
  data: d,
  member,
}: {
  data: OperationsData;
  member: Member;
}) {
  const services = d.services.filter((s) => s.coverage !== "not_served");
  const [selected, setSelected] = useState(services[0]?.id ?? "");
  const service = services.find((s) => s.id === selected);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Guest | "new" | null>(null);
  const flat = (id: string) => {
    const f = d.flats.find((f) => f.id === id);
    return f ? `${f.block}–${f.flat_number}` : "";
  };
  const matches = (id: string, pass = "") =>
    `${flat(id)} ${pass}`.toLowerCase().includes(search.toLowerCase().trim());
  const rows = d.attendance.filter((a) => a.service_id === selected);
  const guests = d.guests.filter((g) => g.service_id === selected);
  const residents = rows.filter((a) =>
    d.enrollments.some((e) => e.id === a.id),
  );
  const expected = rows
    .filter((a) => a.confirmed)
    .reduce((n, a) => n + mealTotal(a), 0);
  const fields: Field[] = [
    {
      name: "flat_id",
      label: "Host flat",
      type: "select",
      options: d.flats.map((f) => ({ value: f.id, label: flat(f.id) })),
    },
    {
      name: "adults",
      label: "Guests above 10",
      type: "number",
      required: true,
    },
    {
      name: "children",
      label: "Guests aged 7–10",
      type: "number",
      required: true,
    },
    {
      name: "under_seven",
      label: "Guests under seven",
      type: "number",
      required: true,
    },
    { name: "note", label: "Notes", max: 300 },
    {
      name: "cancelled",
      label: "Cancel pass (clear check-in first)",
      type: "checkbox",
    },
  ];
  return (
    <>
      <h1>Meal attendance</h1>
      <p>
        <Link href={`/desk/${d.festival.id}`}>Finance</Link> ·{" "}
        <Link href={`/desk/${d.festival.id}/payments`}>
          Register fixed / package payment
        </Link>{" "}
        ·{" "}
        <Link href={`/desk/${d.festival.id}/operations`}>
          Catering & events
        </Link>
      </p>
      {!services.length ? (
        <p className="notice">
          Configure the meal calendar before recording attendance.
        </p>
      ) : (
        <>
          <section className="panel finance-form">
            <label>
              Day and meal
              <select
                value={selected}
                onChange={(e) => {
                  setSelected(e.target.value);
                  setEditing(null);
                  setSearch("");
                }}
              >
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {serviceLabel(s)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Find flat or guest pass
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="A–101 or pass code"
              />
            </label>
            <p>
              <strong>{expected} eligible diners</strong> ·{" "}
              {rows.reduce((n, a) => n + a.attended, 0)} checked in
            </p>
            <p>
              Set the total already admitted for this meal. Remaining quantities
              update after saving. Concurrent edits require a refresh.
            </p>
          </section>
          <section className="panel finance-register">
            <h2>Residents</h2>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Flat</th>
                    <th>Eligible</th>
                    <th>Admitted</th>
                    <th>Remaining</th>
                    <th>Check-in</th>
                  </tr>
                </thead>
                <tbody>
                  {residents
                    .filter((a) => matches(a.flat_id))
                    .map((a) => (
                      <tr key={a.id}>
                        <td>
                          {flat(a.flat_id)}
                          <small>
                            {a.confirmed
                              ? "Fixed fee confirmed"
                              : "Awaiting confirmed fixed payment"}
                          </small>
                        </td>
                        <td>{mealTotal(a)}</td>
                        <td>{a.attended}</td>
                        <td>{Math.max(0, mealTotal(a) - a.attended)}</td>
                        <td>
                          {a.confirmed && (
                            <OperationForm
                              compact
                              key={`${a.id}-${a.service_id}-${a.version}`}
                              operation="resident_checkin"
                              base={{
                                id: a.id,
                                service_id: selected,
                                version: a.version,
                                attended: a.attended,
                              }}
                              fields={[
                                {
                                  name: "attended",
                                  label: `Total admitted ${flat(a.flat_id)}`,
                                  type: "number",
                                  max: mealTotal(a),
                                  required: true,
                                },
                              ]}
                              button="Save check-in"
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {!residents.length && <p>No fixed attendees registered yet.</p>}
          </section>
          <section className="panel finance-register">
            <h2>Guest passes</h2>
            <p>
              Guest registration creates a pass for the selected meal. Record
              any guest payment separately in Finance; automatic billing is
              deferred.
            </p>
            <button className="button" onClick={() => setEditing("new")}>
              Register guests
            </button>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Host flat / pass</th>
                    <th>Registered</th>
                    <th>Admitted / remaining</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {guests
                    .filter((g) => matches(g.flat_id, g.pass_code))
                    .map((g) => (
                      <tr key={g.id}>
                        <td>
                          {flat(g.flat_id)}
                          <small>
                            <Link
                              href={`/guest-pass/${g.pass_code}`}
                              target="_blank"
                            >
                              Open guest pass
                            </Link>
                          </small>
                          <small>{g.pass_code}</small>
                        </td>
                        <td>
                          {g.adults + g.children + g.under_seven}
                          {g.cancelled ? " · Cancelled" : ""}
                        </td>
                        <td>
                          {g.attended} /{" "}
                          {g.cancelled
                            ? 0
                            : g.adults +
                              g.children +
                              g.under_seven -
                              g.attended}
                        </td>
                        <td>
                          {g.created_by === member.user_id && (
                            <button
                              className="text-button"
                              onClick={() => setEditing(g)}
                            >
                              Edit registration
                            </button>
                          )}
                          {!g.cancelled && (
                            <OperationForm
                              compact
                              key={`${g.id}-${g.version}`}
                              operation="guest_checkin"
                              base={{
                                id: g.id,
                                service_id: selected,
                                version: g.version,
                                attended: g.attended,
                              }}
                              fields={[
                                {
                                  name: "attended",
                                  label: "Total guests admitted",
                                  type: "number",
                                  max: g.adults + g.children + g.under_seven,
                                  required: true,
                                },
                              ]}
                              button="Save check-in"
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
          {editing && (
            <section className="panel finance-form">
              <OperationForm
                key={
                  editing === "new" ? selected : editing.id + editing.version
                }
                title={
                  editing === "new" ? "Register guest pass" : "Edit guest pass"
                }
                operation="guest"
                base={
                  editing === "new"
                    ? { service_id: selected, version: 0, cancelled: false }
                    : editing
                }
                fields={
                  editing === "new"
                    ? fields
                    : fields.filter((f) => f.name !== "flat_id")
                }
                onSaved={() => setEditing(null)}
              />
              <button className="text-button" onClick={() => setEditing(null)}>
                Cancel editing
              </button>
            </section>
          )}
          {member.role === "admin" && service && (
            <section className="panel finance-form">
              <OperationForm
                key={service.id + service.version}
                title="Guest registration cutoff"
                operation="meal_access"
                base={{
                  id: service.id,
                  version: service.version,
                  locked: service.attendance_locked,
                  cutoff: service.booking_cutoff,
                }}
                fields={[
                  {
                    name: "locked",
                    label: "Close guest registration",
                    type: "checkbox",
                  },
                  {
                    name: "cutoff",
                    label: "Booking cutoff (India time)",
                    type: "cutoff",
                  },
                  { name: "reason", label: "Reason", max: 300, required: true },
                ]}
              />
            </section>
          )}
        </>
      )}
    </>
  );
}
