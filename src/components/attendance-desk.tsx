"use client";
import { PassShare } from "./pass-share";
import Link from "next/link";
import { AttendanceScanner } from "./attendance-scanner";
import { attendancePage, matchesAttendance } from "@/lib/attendance-list";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { OperationForm, type Field } from "./operation-form";
import {
  mealTotal,
  expectedDiners,
  serviceLabel,
  type OperationsData,
  type Guest,
} from "@/lib/operations";
import type { Member } from "@/lib/types";
export function AttendanceDesk({
  data: d,
  member,
  baseUrl,
}: {
  data: OperationsData;
  member: Member;
  baseUrl: string;
}) {
  const services = d.services.filter(
    (s) => s.coverage !== "not_served" || s.guest_available,
  );
  const params = useSearchParams();
  const selected = services.some((s) => s.id === params.get("service"))
    ? params.get("service")!
    : (services[0]?.id ?? "");
  const setSelected = (id: string) => {
    const query = new URLSearchParams(window.location.search);
    query.set("service", id);
    window.history.replaceState(null, "", `?${query}`);
  };
  const service = services.find((s) => s.id === selected);
  const [scanned, setScanned] = useState<{
    kind: "resident" | "guest";
    id: string;
  } | null>(null);
  useEffect(() => {
    if (!scanned) return;
    const row = document.getElementById(
      `attendance-${scanned.kind}-${scanned.id}`,
    );
    row?.scrollIntoView({ behavior: "smooth", block: "center" });
    row?.focus({ preventScroll: true });
  }, [scanned]);
  const [residentSearch, setResidentSearch] = useState("");
  const [guestSearch, setGuestSearch] = useState("");
  const [residentPage, setResidentPage] = useState(0);
  const [guestPage, setGuestPage] = useState(0);
  const [savedGuest, setSavedGuest] = useState(params.get("guest") ?? "");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<Guest | "new" | null>(null);
  const flat = (id: string) => {
    const f = d.flats.find((f) => f.id === id);
    return f ? `${f.block}–${f.flat_number}` : "";
  };
  const rows = d.attendance.filter((a) => a.service_id === selected);
  const guests = d.guests
    .filter((g) =>
      g.included_services
        ? g.included_services.includes(selected)
        : g.service_id === selected,
    )
    .map((g) =>
      g.package_id
        ? {
            ...g,
            service_id: selected,
            attended:
              g.checkins?.find((c) => c.service_id === selected)?.attended ?? 0,
          }
        : g,
    );
  const residents = rows.filter((a) =>
    d.enrollments.some((e) => e.id === a.id),
  );
  const residentList = attendancePage(
    residents.filter(
      (a) =>
        (!scanned || (scanned.kind === "resident" && scanned.id === a.id)) &&
        matchesAttendance(residentSearch, flat(a.flat_id)),
    ),
    residentPage,
  );
  const guestList = attendancePage(
    guests
      .filter(
        (g) =>
          (!scanned || (scanned.kind === "guest" && scanned.id === g.id)) &&
          matchesAttendance(guestSearch, flat(g.flat_id), g.pass_code),
      )
      .sort(
        (a, b) => Number(b.id === savedGuest) - Number(a.id === savedGuest),
      ),
    guestPage,
  );
  const expected = rows
    .filter((a) => a.confirmed)
    .reduce((n, a) => n + mealTotal(a), 0);
  const fields: Field[] = [
    {
      name: "flat_id",
      label: "Host flat",
      type: "flat",
      flats: d.flats,
    },
    {
      name: "adults",
      label: `Guests above ${d.age_brackets?.child_max_age ?? 10}`,
      type: "number",
      required: true,
    },
    {
      name: "children",
      label: `Guests aged ${d.age_brackets?.child_min_age ?? 7}–${d.age_brackets?.child_max_age ?? 10}`,
      type: "number",
      required: true,
    },
    {
      name: "under_seven",
      label: `Guests under ${d.age_brackets?.child_min_age ?? 7}`,
      type: "number",
      required: true,
    },
    { name: "note", label: "Notes", max: 300 },
    {
      name: "cancelled",
      label: "Cancel unused pass",
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
                  setScanned(null);
                  setEditing(null);
                  setResidentSearch("");
                  setGuestSearch("");
                  setResidentPage(0);
                  setGuestPage(0);
                  setNotice("");
                }}
              >
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {serviceLabel(s)}
                  </option>
                ))}
              </select>
            </label>
            <p>
              <strong>{expected} eligible diners</strong> ·{" "}
              {rows
                .filter((a) => a.confirmed)
                .reduce((n, a) => n + expectedDiners(d, a), 0)}{" "}
              RSVPed · {rows.reduce((n, a) => n + a.attended, 0)} checked in
            </p>
            <p>
              Set the total already admitted for this meal. Remaining quantities
              update after saving. Committee check-in counts can only increase;
              admins can correct mistakes. Concurrent edits require a refresh.
            </p>
          </section>
          <AttendanceScanner
            key={selected}
            onScan={(pass) => {
              const found =
                pass.kind === "resident"
                  ? d.enrollments.find((e) => e.attendance_code === pass.code)
                  : guests.find((g) => g.pass_code === pass.code);
              if (
                !found ||
                (pass.kind === "resident" &&
                  !residents.some((r) => r.id === found.id))
              ) {
                setScanned(null);
                setNotice(
                  "Pass is not available for this festival and selected meal.",
                );
                return {
                  message:
                    "QR read, but this pass is not available for the selected festival, day and meal. Check the day and meal above, then scan again.",
                };
              }
              setScanned({ kind: pass.kind, id: found.id });
              setResidentSearch("");
              setGuestSearch("");
              setResidentPage(0);
              setGuestPage(0);
              const resident =
                pass.kind === "resident"
                  ? residents.find((r) => r.id === found.id)
                  : undefined;
              const guest =
                pass.kind === "guest"
                  ? guests.find((g) => g.id === found.id)
                  : undefined;
              const message = guest?.cancelled
                ? `Guest pass for ${flat(found.flat_id)} is cancelled. Check-in is unavailable.`
                : resident && !resident.confirmed
                  ? `Resident pass for ${flat(found.flat_id)} found. Fixed payment is not confirmed; admission is unavailable.`
                  : `${pass.kind === "guest" ? "Guest" : "Resident"} pass for ${flat(found.flat_id)} found. Review the count and press Save check-in. Scanning alone does not record attendance.`;
              setNotice(message);
              return {
                message,
                targetId: `attendance-${pass.kind}-${found.id}`,
              };
            }}
          />
          {notice && (
            <p className="notice" role="status">
              {notice}
            </p>
          )}
          {scanned && (
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                setScanned(null);
                setNotice("");
              }}
            >
              Clear scanned pass · show all
            </button>
          )}

          <section className="panel finance-register">
            <h2>Residents</h2>
            <label>
              Search residents by flat number
              <input
                type="search"
                value={residentSearch}
                placeholder="101 or A-101"
                onChange={(e) => {
                  setResidentSearch(e.target.value);
                  setResidentPage(0);
                }}
              />
            </label>
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
                  {residentList.items.map((a) => (
                    <tr
                      key={a.id}
                      id={`attendance-resident-${a.id}`}
                      tabIndex={-1}
                      className={
                        scanned?.id === a.id ? "scanned-attendance" : undefined
                      }
                    >
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
                        {(a.confirmed ||
                          (member.role === "admin" && a.attended > 0)) && (
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
                                max:
                                  member.role === "admin"
                                    ? Math.max(mealTotal(a), a.attended)
                                    : mealTotal(a),
                                min: member.role === "admin" ? 0 : a.attended,
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
            {!residentList.total && (
              <p>
                {residents.length
                  ? "No residents match this flat number."
                  : "No fixed attendees registered yet."}
              </p>
            )}
            <AttendancePagination
              list={residentList}
              onPage={setResidentPage}
              label="Residents"
            />
          </section>
          <section className="panel finance-register">
            <h2>Guest passes</h2>
            <label>
              Search guest passes by flat number or pass code
              <input
                type="search"
                value={guestSearch}
                placeholder="101, A-101 or pass code"
                onChange={(e) => {
                  setGuestSearch(e.target.value);
                  setGuestPage(0);
                }}
              />
            </label>
            <p>
              Every new guest pass is created with a guest entry. Guests can
              check in before admin confirmation.
            </p>
            <Link
              className="button"
              href={`/desk/${d.festival.id}/guest-payments`}
            >
              Record guest entry & create pass
            </Link>
            <div className="table-scroll">
              <table className="guest-pass-table">
                <thead>
                  <tr>
                    <th>Host flat / pass</th>
                    <th>Registered</th>
                    <th>Admitted / remaining</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {guestList.items.map((g) => (
                    <tr
                      key={g.id}
                      id={`attendance-guest-${g.id}`}
                      tabIndex={-1}
                      className={`guest-pass-row ${scanned?.id === g.id ? "scanned-attendance" : ""}`}
                    >
                      <td>
                        {flat(g.flat_id)}
                        {!g.cancelled && (
                          <PassShare
                            showOpen
                            url={`${baseUrl}/guest-pass/${g.pass_code}`}
                            festival={d.festival.name}
                          />
                        )}
                        <details className="guest-pass-code">
                          <summary>Pass code</summary>
                          <small>{g.pass_code}</small>
                        </details>
                        <small>
                          {g.payment_status === "confirmed"
                            ? "Receipt confirmed"
                            : g.payment_status === "pending"
                              ? "Receipt awaiting confirmation"
                              : g.payment_status === "payee_due"
                                ? "Payee owes guest fee"
                                : "No active linked receipt"}
                        </small>
                      </td>
                      <td data-label="Registered">
                        {g.adults + g.children + g.under_seven}
                        {g.cancelled ? " · Cancelled" : ""}
                      </td>
                      <td data-label="Admitted / remaining">
                        {g.attended} /{" "}
                        {g.cancelled
                          ? 0
                          : g.adults + g.children + g.under_seven - g.attended}
                      </td>
                      <td className="guest-checkin">
                        <div className="guest-entry-actions">
                          {!g.cancelled && (
                            <Link
                              className="text-button"
                              href={`/desk/${d.festival.id}/guest-payments?guest=${g.id}`}
                            >
                              Record linked payment
                            </Link>
                          )}
                          {g.created_by === member.user_id && (
                            <button
                              className="text-button"
                              onClick={() => setEditing(g)}
                            >
                              Edit registration
                            </button>
                          )}
                        </div>
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
                                min: member.role === "admin" ? 0 : g.attended,
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
            {!guestList.total && (
              <p>
                {guests.length
                  ? "No guest passes match this search."
                  : "No guests registered for this meal yet."}
              </p>
            )}
            <AttendancePagination
              list={guestList}
              onPage={setGuestPage}
              label="Guest passes"
            />
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
                onSaved={(saved) => {
                  setSavedGuest(String(saved.id));
                  setGuestSearch("");
                  setGuestPage(0);
                  setNotice(
                    "Guest pass saved. The updated pass appears first in the list.",
                  );
                  setEditing(null);
                }}
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

function AttendancePagination({
  list,
  onPage,
  label,
}: {
  list: { page: number; pages: number; total: number };
  onPage: (page: number) => void;
  label: string;
}) {
  if (!list.total) return null;
  return (
    <nav className="entry-actions" aria-label={`${label} pages`}>
      <span>
        {list.page * 10 + 1}–{Math.min((list.page + 1) * 10, list.total)} of{" "}
        {list.total}
      </span>
      <button
        type="button"
        className="button secondary"
        disabled={list.page === 0}
        onClick={() => onPage(list.page - 1)}
      >
        Previous
      </button>
      <button
        type="button"
        className="button secondary"
        disabled={list.page + 1 >= list.pages}
        onClick={() => onPage(list.page + 1)}
      >
        Next
      </button>
    </nav>
  );
}
