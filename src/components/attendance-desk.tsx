"use client";
import { ResidentContactActions } from "./rsvp-contacts";
import { GuestPassMenu } from "./guest-pass-menu";
import Link from "next/link";
import { AttendanceScanner } from "./attendance-scanner";
import {
  attendanceQuerySchema,
  type AttendanceData,
} from "@/lib/attendance-data";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { OperationForm, type Field } from "./operation-form";
import { mealTotal, serviceLabel, type Guest } from "@/lib/operations";
import type { Member } from "@/lib/types";
export function AttendanceDesk({
  data: initial,
  member,
  baseUrl,
}: {
  data: AttendanceData;
  member: Member;
  baseUrl: string;
}) {
  const params = useSearchParams();
  const parsedQuery = attendanceQuerySchema.safeParse(
    Object.fromEntries(params),
  );
  const initialQuery = parsedQuery.success ? parsedQuery.data : undefined;
  const [selected, setSelectedMeal] = useState(
    initial.selected_service_id ?? "",
  );
  const setSelected = (id: string) => {
    setSelectedMeal(id);
    const query = new URLSearchParams(window.location.search);
    query.set("service", id);
    window.history.replaceState(null, "", `?${query}`);
  };
  const [scan, setScan] = useState<{
    kind: "resident" | "guest";
    code: string;
  } | null>(
    initialQuery?.code && initialQuery.kind
      ? { code: initialQuery.code, kind: initialQuery.kind }
      : null,
  );
  const [residentSearch, setResidentSearch] = useState(
    initialQuery?.resident_search ?? "",
  );
  const [guestSearch, setGuestSearch] = useState(
    initialQuery?.guest_search ?? "",
  );
  const [residentPage, setResidentPage] = useState(initial.resident_list.page);
  const [guestPage, setGuestPage] = useState(initial.guest_list.page);
  const [savedGuest, setSavedGuest] = useState(initialQuery?.guest ?? "");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<Guest | "new" | null>(null);
  const [revision, setRevision] = useState(0);
  const reload = () => setRevision((v) => v + 1);
  const query = new URLSearchParams({
    resident_search: residentSearch,
    guest_search: guestSearch,
    resident_page: String(residentPage),
    guest_page: String(guestPage),
  });
  if (selected) query.set("service", selected);
  if (savedGuest) query.set("guest", savedGuest);
  if (scan) {
    query.set("kind", scan.kind);
    query.set("code", scan.code);
  }
  const queryString = query.toString();
  const requestKey = `${queryString}:${revision}`;
  const [response, setResponse] = useState({
    initial,
    key: requestKey,
    data: initial,
    error: "",
  });
  const d = response.initial === initial ? response.data : initial;
  const loading = response.initial !== initial || response.key !== requestKey;
  const loadedRequest = useRef({ initial, key: requestKey });
  useEffect(() => {
    if (
      loadedRequest.current.initial === initial &&
      loadedRequest.current.key === requestKey
    )
      return;
    const controller = new AbortController();
    // Debounce typing and cancel obsolete searches so late responses cannot replace the selected meal.
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/desk/${initial.festival.id}/attendance/records?${queryString}`,
          {
            signal: controller.signal,
            cache: "no-store",
          },
        );
        const body = await res.json();
        if (!res.ok)
          throw new Error(body.error ?? "Could not load attendance.");
        if (!controller.signal.aborted) {
          loadedRequest.current = { initial, key: requestKey };
          setResponse({ initial, key: requestKey, data: body, error: "" });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          loadedRequest.current = { initial, key: requestKey };
          setResponse((previous) => ({
            ...previous,
            initial,
            key: requestKey,
            error:
              error instanceof Error
                ? error.message
                : "Could not load attendance.",
          }));
        }
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [initial, queryString, requestKey]);
  const services = d.services.filter(
    (s) => s.coverage !== "not_served" || s.guest_available,
  );
  const service = services.find((s) => s.id === selected);
  const residents = d.attendance;
  const guests = d.guests;
  const residentList = { ...d.resident_list, items: residents };
  const guestList = { ...d.guest_list, items: guests };
  const found =
    scan?.kind === "resident"
      ? d.enrollments.find((e) => e.attendance_code === scan.code)
      : scan
        ? guests.find((g) => g.pass_code === scan.code)
        : undefined;
  const scanned =
    !loading && found && scan ? { kind: scan.kind, id: found.id } : null;
  const scannedId = scanned ? `attendance-${scanned.kind}-${scanned.id}` : "";
  useEffect(() => {
    if (!scannedId) return;
    const row = document.getElementById(scannedId);
    row?.scrollIntoView({ behavior: "smooth", block: "center" });
    row?.focus({ preventScroll: true });
  }, [scannedId]);
  const flat = (id: string) => {
    const f = d.flats.find((f) => f.id === id);
    return f ? `${f.block}–${f.flat_number}` : "";
  };
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
      {!services.length && (
        <p className="notice">
          Configure the meal calendar before recording attendance.
        </p>
      )}
      <>
        <section className="panel finance-form">
          <label>
            Day and meal
            <select
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value);
                setScan(null);
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
            <strong>{d.totals.eligible} eligible diners</strong> ·{" "}
            {d.totals.rsvped} RSVPed · {d.totals.attended} checked in
          </p>
          <button
            type="button"
            className="button secondary"
            disabled={loading}
            onClick={reload}
          >
            Refresh attendance
          </button>
          <p>
            Set the total already admitted for this meal. Remaining quantities
            update after saving. Committee check-in counts can only increase;
            admins can correct mistakes. Concurrent edits require a refresh.
          </p>
        </section>
        <AttendanceScanner
          key={selected}
          onScan={(pass) => {
            setScan(pass);
            setResidentSearch("");
            setGuestSearch("");
            setResidentPage(0);
            setGuestPage(0);
            setNotice("");
            reload();
            return {
              message:
                "QR read. The lookup result appears below; scanning does not record attendance.",
            };
          }}
        />
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        {scan && !loading && !response.error && (
          <p className="notice" role="status">
            {found
              ? `Pass for ${flat(found.flat_id)} found. Review eligibility and press Save check-in. Scanning alone does not record attendance.`
              : "Pass is not available for this festival and selected meal."}
          </p>
        )}
        {scan && (
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              setScan(null);
              setNotice("");
            }}
          >
            Clear scanned pass · show all
          </button>
        )}

        {loading && <p role="status">Loading attendance…</p>}
        {response.error && (
          <p role="alert">
            {response.error}{" "}
            <button type="button" onClick={reload}>
              Try again
            </button>
          </p>
        )}
        <div aria-busy={loading} className="attendance-results">
          <section className="panel finance-register">
            <h2>Residents</h2>
            <label>
              Search residents by flat or phone
              <input
                maxLength={120}
                type="search"
                value={residentSearch}
                placeholder="101, A-101 or phone number"
                onChange={(e) => {
                  setResidentSearch(e.target.value);
                  setResidentPage(0);
                }}
              />
            </label>
            <p className="tiny">
              Swipe or scroll sideways to browse flats. Each page shows up to
              10.
            </p>
            <fieldset
              disabled={loading || Boolean(response.error)}
              className="guest-pass-carousel"
              key={`${residentList.page}-${selected}`}
              role="region"
              aria-label="Resident attendance cards"
              tabIndex={0}
            >
              {residentList.items.map((a) => {
                const pass = d.enrollments.find((e) => e.id === a.id);
                return (
                  <article
                    key={a.id}
                    id={`attendance-resident-${a.id}`}
                    tabIndex={-1}
                    className={`guest-pass-card resident-pass-card ${scanned?.id === a.id ? "scanned-attendance" : ""}`}
                  >
                    <div className="guest-pass-heading">
                      <div className="guest-card-title">
                        <h3>{flat(a.flat_id)}</h3>
                        {pass?.attendance_code && (
                          <GuestPassMenu
                            kind="resident"
                            url={`${baseUrl}/resident-pass/${pass.attendance_code}`}
                            festival={d.festival.name}
                            flat={flat(a.flat_id)}
                            code={pass.attendance_code}
                          >
                            <ResidentContactActions
                              enrollment={pass}
                              admin={member.role === "admin"}
                              baseUrl={baseUrl}
                              festival={d.festival.name}
                            />
                          </GuestPassMenu>
                        )}
                      </div>
                      <p className="tiny">{service && serviceLabel(service)}</p>
                      <small>
                        {pass?.eligible
                          ? "Fixed fee confirmed"
                          : "Awaiting confirmed fixed payment"}
                      </small>
                    </div>
                    <div className="guest-pass-stat">
                      <span>Eligible</span>
                      {mealTotal(a)}
                    </div>
                    <div className="guest-pass-stat">
                      <span>Admitted</span>
                      {a.attended}
                    </div>
                    <div className="guest-pass-stat">
                      <span>Remaining</span>
                      {Math.max(0, mealTotal(a) - a.attended)}
                    </div>
                    <p className="resident-card-contact tiny">
                      {pass?.members.length ?? 0} registered members ·{" "}
                      {pass?.contact_phone ?? "Contact number needed"}
                    </p>
                    <div className="guest-checkin">
                      {service &&
                        (a.confirmed ||
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
                            onSaved={reload}
                            button="Save check-in"
                          />
                        )}
                    </div>
                  </article>
                );
              })}
            </fieldset>
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
                maxLength={120}
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
            <p className="tiny">
              Swipe or scroll sideways to browse passes. Each page shows up to
              10.
            </p>
            <fieldset
              disabled={loading || Boolean(response.error)}
              className="guest-pass-carousel"
              key={`${guestList.page}-${selected}`}
              role="region"
              aria-label="Guest pass cards"
              tabIndex={0}
            >
              {guestList.items.map((g) => (
                <article
                  key={g.id}
                  id={`attendance-guest-${g.id}`}
                  tabIndex={-1}
                  className={`guest-pass-card ${scanned?.id === g.id ? "scanned-attendance" : ""}`}
                >
                  <div className="guest-pass-heading">
                    <div className="guest-card-title">
                      <h3>{flat(g.flat_id)}</h3>
                      <GuestPassMenu
                        url={`${baseUrl}/guest-pass/${g.pass_code}`}
                        festival={d.festival.name}
                        flat={flat(g.flat_id)}
                        code={g.pass_code}
                        paymentUrl={
                          !g.cancelled
                            ? `/desk/${d.festival.id}/guest-payments?guest=${g.id}`
                            : undefined
                        }
                        onEdit={
                          g.created_by === member.user_id
                            ? () => setEditing(g)
                            : undefined
                        }
                      />
                    </div>
                    <p className="tiny">{service && serviceLabel(service)}</p>
                    <small>
                      {g.payment_status === "confirmed"
                        ? "Receipt confirmed"
                        : g.payment_status === "pending"
                          ? "Receipt awaiting confirmation"
                          : g.payment_status === "payee_due"
                            ? "Payee owes guest fee"
                            : "No active linked receipt"}
                    </small>
                  </div>
                  <div className="guest-pass-stat">
                    <span>Registered</span>
                    {g.adults + g.children + g.under_seven}
                    {g.cancelled ? " · Cancelled" : ""}
                  </div>
                  <div className="guest-pass-stat">
                    <span>Admitted / remaining</span>
                    {g.attended} /{" "}
                    {g.cancelled
                      ? 0
                      : g.adults + g.children + g.under_seven - g.attended}
                  </div>
                  <div className="guest-checkin">
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
                        onSaved={reload}
                        button="Save check-in"
                      />
                    )}
                  </div>
                </article>
              ))}
            </fieldset>
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
        </div>
        {editing && (
          <section className="panel finance-form">
            <OperationForm
              key={editing === "new" ? selected : editing.id + editing.version}
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
                reload();
              }}
            />
            <button className="text-button" onClick={() => setEditing(null)}>
              Cancel editing
            </button>
          </section>
        )}
      </>
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
