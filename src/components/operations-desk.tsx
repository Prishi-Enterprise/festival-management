"use client";
import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { OperationForm, type Field } from "./operation-form";
import { PageHeading } from "./page-heading";
import { PrintButton } from "./print-button";
import {
  eventCategories,
  participantCategories,
  expectedDiners,
  serviceLabel,
  type OperationsData,
  type Participant,
  type FestivalEvent,
  type Catering,
} from "@/lib/operations";
import { inr } from "@/lib/finance";
import type { Member } from "@/lib/types";
const options = (values: readonly string[]) =>
  values.map((value) => ({ value, label: value }));
const notes: Field = { name: "note", label: "Notes", max: 300 };
const categoryFields = (values: readonly string[]): Field[] => [
  {
    name: "category",
    label: "Category",
    type: "select",
    options: options(values),
  },
  { name: "category_other", label: "Other category — describe", max: 120 },
];
export function OperationsDesk({
  data: d,
  member,
}: {
  data: OperationsData;
  member: Member;
}) {
  const admin = member.role === "admin";
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") === "events" ? "events" : "catering";
  function selectView(key: string, value: string) {
    const params = new URLSearchParams(window.location.search);
    params.set(key, value);
    window.history.replaceState(null, "", `?${params.toString()}`);
  }
  const served = d.services.filter((s) => s.coverage !== "not_served");
  const serviceId = searchParams.get("service") ?? served[0]?.id ?? "";
  const service = served.find((s) => s.id === serviceId) ?? served[0];
  const [editEvent, setEditEvent] = useState<FestivalEvent | "new" | null>(
    null,
  );
  const [editParticipant, setEditParticipant] = useState<
    Participant | "new" | null
  >(null);
  const eventId = searchParams.get("event") ?? d.events[0]?.id ?? "";
  const event = d.events.find((e) => e.id === eventId) ?? d.events[0];
  const [editCatering, setEditCatering] = useState(false);
  const flatName = (id: string) => {
    const f = d.flats.find((f) => f.id === id);
    return f ? `${f.block}–${f.flat_number}` : "Unknown flat";
  };
  const flatOptions = d.flats.map((f) => ({
    value: f.id,
    label: `${f.block}–${f.flat_number}`,
  }));
  const attendance = d.attendance
    .filter((a) => a.service_id === service?.id)
    .sort((a, b) =>
      flatName(a.flat_id).localeCompare(flatName(b.flat_id), undefined, {
        numeric: true,
      }),
    );
  const confirmed = attendance.filter((a) => a.confirmed);
  const expected = confirmed.reduce((n, a) => n + expectedDiners(d, a), 0);
  const checked = confirmed.reduce((n, a) => n + a.attended, 0);
  const participants = d.participants.filter((p) => p.event_id === event?.id);
  const active = participants.filter((p) => !p.cancelled);
  const catering = d.catering?.find((c) => c.service_id === service?.id);
  const bill = d.finance?.find((e) => e.id === catering?.bill_id);
  const quantities = admin
    ? catering
    : d.catering_quantities?.find((c) => c.service_id === service?.id);
  const exportUrl = (kind: string, key?: string) =>
    `/desk/${d.festival.id}/operations/export?kind=${kind}${key ? `&id=${key}` : ""}`;
  const pickService = (
    <label className="operations-picker no-print">
      Meal service
      <select
        value={service?.id ?? ""}
        onChange={(e) => {
          selectView("service", e.target.value);
          setEditCatering(false);
        }}
      >
        {served.map((s) => (
          <option key={s.id} value={s.id}>
            {serviceLabel(s)}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <>
      <PageHeading
        eyebrow="DAILY OPERATIONS"
        title={d.festival.name}
        description="Meal lists, catering quantities and event participants — with no automatic charges."
        action={
          <Link className="button secondary" href={`/desk/${d.festival.id}`}>
            Financial entries
          </Link>
        }
      />
      <nav className="editor-tabs no-print" aria-label="Operations sections">
        {[
          ["catering", "Catering quantities"],
          ["events", "Event rosters"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={tab === key ? "selected" : ""}
            onClick={() => selectView("tab", key)}
            aria-pressed={tab === key}
          >
            {label}
          </button>
        ))}
      </nav>
      {tab === "catering" && !service && (
        <section className="panel empty-state">
          <h2>No meals configured yet</h2>
          <p>
            An admin must save the meal calendar and mark the services being
            served.
          </p>
          {admin && (
            <Link href={`/admin/festivals/${d.festival.id}#meal-calendar`}>
              Configure meal calendar →
            </Link>
          )}
        </section>
      )}
      <p>
        <Link
          className="button secondary"
          href={`/desk/${d.festival.id}/attendance`}
        >
          Open attendance & guest passes
        </Link>
      </p>
      {tab === "catering" && service && (
        <>
          {pickService}
          <section className="panel finance-register">
            <h2>
              {service.service_date} · {service.meal}
            </h2>
            <div className="operations-totals">
              <strong>{expected} expected diners</strong>
              <span>{quantities?.ordered ?? 0} plates ordered</span>
              <span>{quantities?.served ?? 0} plates served</span>
              <span>{checked} people checked in</span>
            </div>
            <p className="muted">
              Diners, check-ins and caterer plate counts are separate.
              Differences are shown for reconciliation, not silently changed.
            </p>
            {admin && (
              <>
                <p>
                  Order buffer / shortage: {(catering?.ordered ?? 0) - expected}{" "}
                  plates. Served vs check-ins:{" "}
                  {(catering?.served ?? 0) - checked}.
                </p>
                <div className="entry-actions">
                  <button
                    className="button"
                    onClick={() => setEditCatering(true)}
                    disabled={Boolean(
                      catering && catering.created_by !== member.user_id,
                    )}
                  >
                    {catering
                      ? "Edit quantities & bill"
                      : "Record quantities & bill"}
                  </button>
                  <Link
                    className="button secondary"
                    href={exportUrl("catering")}
                  >
                    Download catering CSV
                  </Link>
                  <PrintButton />
                </div>
                <p>
                  Bill:{" "}
                  {bill
                    ? `#${bill.number} · ${bill.status} · ${inr(bill.amount)}`
                    : "Not recorded"}
                  . Confirm or unlock its linked expense bill in{" "}
                  <Link href={`/desk/${d.festival.id}`}>Financial entries</Link>
                  .
                </p>
              </>
            )}
          </section>
          {admin && editCatering && (
            <section className="panel finance-form no-print">
              <OperationForm
                key={`${service.id}-${catering?.version ?? 0}-${bill?.version ?? 0}`}
                operation="catering"
                title="Catering quantities"
                base={
                  catering
                    ? { ...catering, bill_version: bill?.version ?? 0 }
                    : {
                        service_id: service.id,
                        version: 0,
                        bill_version: 0,
                        ordered: expected,
                        served: 0,
                        billed: 0,
                        unit_rate: 0,
                        extras: 0,
                      }
                }
                fields={[
                  {
                    name: "vendor_id",
                    label: "Supplier",
                    type: "select",
                    options: d.vendors?.map((v) => ({
                      value: v.id,
                      label: v.name,
                    })),
                  },
                  ...["ordered", "served", "billed"].map((name) => ({
                    name,
                    label: `Plates ${name}`,
                    type: "number" as const,
                    max: 100000,
                    required: true,
                  })),
                  {
                    name: "unit_rate",
                    label: "Buying rate / billed plate (₹)",
                    type: "money",
                    required: true,
                  },
                  {
                    name: "extras",
                    label: "Extras (₹)",
                    type: "money",
                    required: true,
                  },
                  notes,
                ]}
                onSaved={() => setEditCatering(false)}
              />
              <p className="small muted">
                Total = billed plates × buying rate + extras. Saving creates or
                updates one pending expense bill, never a duplicate. Confirmed
                bills must be unlocked before editing. A zero total records
                quantities without an expense.
              </p>
              <button
                className="text-button"
                onClick={() => setEditCatering(false)}
              >
                Cancel
              </button>
            </section>
          )}
          {admin && catering && (
            <PaymentAllocations data={d} catering={catering} />
          )}
          {admin && <CateringSummary data={d} />}
        </>
      )}
      {tab === "events" && (
        <>
          <div className="section-heading no-print">
            <label className="operations-picker">
              Event
              <select
                value={event?.id ?? ""}
                onChange={(e) => {
                  selectView("event", e.target.value);
                  setEditParticipant(null);
                }}
              >
                <option value="">Choose event</option>
                {d.events.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.service_date} · {e.title}
                  </option>
                ))}
              </select>
            </label>
            {admin && (
              <button className="button" onClick={() => setEditEvent("new")}>
                Create event
              </button>
            )}
          </div>
          {admin && editEvent && (
            <section className="panel finance-form no-print">
              <OperationForm
                key={
                  editEvent === "new"
                    ? "new-event"
                    : `${editEvent.id}-${editEvent.version}`
                }
                operation="event"
                title={editEvent === "new" ? "Create event" : "Edit event"}
                base={
                  editEvent === "new"
                    ? {
                        festival_id: d.festival.id,
                        version: 0,
                        registration_closed: false,
                      }
                    : editEvent
                }
                fields={[
                  {
                    name: "title",
                    label: "Event name",
                    required: true,
                    max: 100,
                  },
                  {
                    name: "service_date",
                    label: "Festival date",
                    type: "select",
                    options: d.days.map((day) => ({
                      value: day.service_date,
                      label: `${day.service_date} · ${day.label}`,
                    })),
                  },
                  ...categoryFields(eventCategories),
                  {
                    name: "registration_closed",
                    label: "Close registration",
                    type: "checkbox",
                  },
                ]}
                onSaved={(saved) => {
                  selectView("event", String(saved.id));
                  setEditEvent(null);
                }}
              />
              <button
                className="text-button"
                onClick={() => setEditEvent(null)}
              >
                Cancel
              </button>
            </section>
          )}
          {event ? (
            <section className="panel finance-register">
              <div className="section-heading">
                <div>
                  <h2>{event.title}</h2>
                  <p>
                    {event.service_date} · {event.category}
                    {event.category_other && ` — ${event.category_other}`} ·
                    Registration {event.registration_closed ? "closed" : "open"}
                  </p>
                </div>
                <div className="entry-actions">
                  <PrintButton />
                  <Link
                    className="button secondary"
                    href={exportUrl("events", event.id)}
                  >
                    Download roster CSV
                  </Link>
                  {admin && (
                    <button
                      className="button secondary"
                      onClick={() => setEditEvent(event)}
                    >
                      Edit event / registration
                    </button>
                  )}
                </div>
              </div>
              <p>
                {active.length} active participants ·{" "}
                {active.filter((p) => p.attended).length} attended ·{" "}
                {participants.filter((p) => p.cancelled).length} cancelled
              </p>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Sequence</th>
                      <th>Name</th>
                      <th>Flat</th>
                      <th>Category</th>
                      <th>Theme / group</th>
                      <th>Notes</th>
                      <th>Status</th>
                      <th className="no-print">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {participants.map((p) => (
                      <tr key={p.id}>
                        <td>{p.sequence}</td>
                        <td>{p.name}</td>
                        <td>{flatName(p.flat_id)}</td>
                        <td>
                          {p.category}
                          {p.category_other && ` — ${p.category_other}`}
                        </td>
                        <td>{p.theme}</td>
                        <td>{p.note}</td>
                        <td>
                          {p.cancelled
                            ? "Cancelled"
                            : p.attended
                              ? "Attended"
                              : "Registered"}
                        </td>
                        <td className="no-print">
                          {(admin || p.created_by === member.user_id) && (
                            <button
                              className="text-button"
                              onClick={() => setEditParticipant(p)}
                            >
                              Edit
                            </button>
                          )}
                          {!p.cancelled && (
                            <OperationForm
                              key={`event-check-${p.id}-${p.version}`}
                              compact
                              operation="event_checkin"
                              base={{
                                id: p.id,
                                version: p.version,
                                attended: p.attended,
                              }}
                              fields={[
                                {
                                  name: "attended",
                                  label: `Attended: ${p.name}`,
                                  type: "checkbox",
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
              <button
                className="button no-print"
                onClick={() => setEditParticipant("new")}
                disabled={event.registration_closed}
              >
                Add participant
              </button>
              <p className="small">
                Generated{" "}
                {new Date(d.as_of).toLocaleString("en-IN", {
                  timeZone: "Asia/Kolkata",
                })}{" "}
                IST.
              </p>
            </section>
          ) : (
            <section className="panel empty-state">
              <h2>No events yet</h2>
              <p>
                An admin can create Mahila Aarati, Veshbusha or another event.
              </p>
            </section>
          )}
          {event && editParticipant && (
            <section className="panel finance-form no-print">
              <OperationForm
                key={
                  editParticipant === "new"
                    ? `new-${event.id}`
                    : `participant-${editParticipant.id}-${editParticipant.version}`
                }
                operation="participant"
                title="Event participant"
                base={
                  editParticipant === "new"
                    ? {
                        event_id: event.id,
                        version: 0,
                        sequence:
                          Math.max(0, ...participants.map((p) => p.sequence)) +
                          1,
                        cancelled: false,
                      }
                    : editParticipant
                }
                fields={[
                  {
                    name: "name",
                    label: "Participant name",
                    required: true,
                    max: 100,
                  },
                  {
                    name: "flat_id",
                    label: "Flat",
                    type: "select",
                    options: flatOptions,
                  },
                  ...categoryFields(participantCategories),
                  {
                    name: "sequence",
                    label: "Sequence",
                    type: "number",
                    max: 10000,
                    required: true,
                  },
                  { name: "theme", label: "Costume / theme / group", max: 120 },
                  notes,
                  {
                    name: "cancelled",
                    label: "Cancel registration",
                    type: "checkbox",
                  },
                ]}
                onSaved={() => setEditParticipant(null)}
              />
              <button
                className="text-button"
                onClick={() => setEditParticipant(null)}
              >
                Cancel edit
              </button>
            </section>
          )}
        </>
      )}
    </>
  );
}
function PaymentAllocations({
  data: d,
  catering: c,
}: {
  data: OperationsData;
  catering: Catering;
}) {
  const payments = (d.finance ?? []).filter(
    (e) =>
      e.kind === "payment" &&
      e.status === "confirmed" &&
      e.vendor_id === c.vendor_id,
  );
  const [paymentId, setPaymentId] = useState(payments[0]?.id ?? "");
  const payment = payments.find((p) => p.id === paymentId) ?? payments[0];
  const current = d.allocations?.find(
    (a) => a.catering_id === c.id && a.payment_id === payment?.id,
  );
  const elsewhere = (d.allocations ?? [])
    .filter((a) => a.payment_id === payment?.id && a.catering_id !== c.id)
    .reduce((n, a) => n + Number(a.amount), 0);
  return (
    <section className="panel finance-form no-print">
      <h3>Apply an advance / payment to this meal</h3>
      <p className="muted">
        Allocate existing confirmed supplier payments. This does not move money
        or create another expense. Unallocated money stays a supplier advance.
        Set an allocation to zero to remove it.
      </p>
      {payment ? (
        <>
          <label>
            Payment
            <select
              value={payment.id}
              onChange={(e) => setPaymentId(e.target.value)}
            >
              {payments.map((p) => (
                <option key={p.id} value={p.id}>
                  #{p.number} · {p.occurred_on} · {inr(p.amount)}
                </option>
              ))}
            </select>
          </label>
          <p>Available for this meal: {inr(payment.amount - elsewhere)}</p>
          <OperationForm
            key={`${c.id}-${payment.id}-${current?.version ?? 0}`}
            operation="allocation"
            base={{
              catering_id: c.id,
              payment_id: payment.id,
              version: current?.version ?? 0,
              amount: current?.amount ?? 0,
            }}
            fields={[
              {
                name: "amount",
                label: "Amount allocated (₹)",
                type: "money",
                required: true,
              },
            ]}
            button="Save allocation"
          />
        </>
      ) : (
        <p>
          No confirmed payments to this supplier yet. Record and confirm an
          advance/payment in Financial entries first.
        </p>
      )}
    </section>
  );
}
function CateringSummary({ data: d }: { data: OperationsData }) {
  const total = (d.catering ?? []).reduce(
    (n, c) =>
      n +
      Number(
        d.finance?.find((e) => e.id === c.bill_id && e.status === "confirmed")
          ?.amount ?? 0,
      ),
    0,
  );
  const paid = (d.allocations ?? [])
    .filter((a) =>
      d.finance?.some((p) => p.id === a.payment_id && p.status === "confirmed"),
    )
    .reduce((n, a) => n + Number(a.amount), 0);
  const provisional = (d.catering ?? []).reduce(
    (n, c) =>
      n +
      Number(
        d.finance?.find((e) => e.id === c.bill_id && e.status === "pending")
          ?.amount ?? 0,
      ),
    0,
  );
  return (
    <section className="panel finance-register">
      <h2>Daily catering settlement</h2>
      <p className="muted">
        Confirmed bills and confirmed allocated payments determine settlement.
        Pending bills are shown separately. A negative balance is an advance.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Date / meal</th>
              <th>Supplier</th>
              <th>Expected</th>
              <th>Ordered / served / billed</th>
              <th>Rate + extras</th>
              <th>Bill status</th>
              <th>Approved cost</th>
              <th>Allocated payment</th>
              <th>Due / (advance)</th>
            </tr>
          </thead>
          <tbody>
            {(d.catering ?? []).map((c) => {
              const s = d.services.find((s) => s.id === c.service_id)!;
              const b = d.finance?.find((e) => e.id === c.bill_id);
              const cost = b?.status === "confirmed" ? Number(b.amount) : 0;
              const allocation = (d.allocations ?? [])
                .filter(
                  (a) =>
                    a.catering_id === c.id &&
                    d.finance?.some(
                      (p) => p.id === a.payment_id && p.status === "confirmed",
                    ),
                )
                .reduce((n, a) => n + Number(a.amount), 0);
              return (
                <tr key={c.id}>
                  <td>
                    {s.service_date}
                    <small>{s.meal}</small>
                  </td>
                  <td>{d.vendors?.find((v) => v.id === c.vendor_id)?.name}</td>
                  <td>
                    {d.attendance
                      .filter((a) => a.service_id === s.id && a.confirmed)
                      .reduce((n, a) => n + expectedDiners(d, a), 0)}
                  </td>
                  <td>
                    {c.ordered} / {c.served} / {c.billed}
                  </td>
                  <td>
                    {inr(c.unit_rate)} + {inr(c.extras)}
                  </td>
                  <td>{b?.status ?? "No bill"}</td>
                  <td>{inr(cost)}</td>
                  <td>{inr(allocation)}</td>
                  <td>{inr(cost - allocation)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan={6}>Total</th>
              <td>{inr(total)}</td>
              <td>{inr(paid)}</td>
              <td>{inr(total - paid)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p>Pending bill value excluded: {inr(provisional)}.</p>
      <h3>Supplier advances not yet allocated to meals</h3>
      <ul>
        {(d.vendors ?? [])
          .filter((v) => (d.catering ?? []).some((c) => c.vendor_id === v.id))
          .map((v) => {
            const payments = (d.finance ?? []).filter(
              (p) =>
                p.kind === "payment" &&
                p.status === "confirmed" &&
                p.vendor_id === v.id,
            );
            const paymentTotal = payments.reduce(
              (n, p) => n + Number(p.amount),
              0,
            );
            const applied = (d.allocations ?? [])
              .filter((a) => payments.some((p) => p.id === a.payment_id))
              .reduce((n, a) => n + Number(a.amount), 0);
            return (
              <li key={v.id}>
                {v.name}: {inr(paymentTotal - applied)}
              </li>
            );
          })}
      </ul>
    </section>
  );
}
