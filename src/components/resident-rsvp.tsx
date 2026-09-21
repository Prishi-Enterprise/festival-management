"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveRsvp } from "@/app/rsvp/actions";
export type RsvpDay = {
  date: string;
  label: string;
  attendees: number;
  version: number;
  open: boolean;
};
export function ResidentRsvp({
  code,
  maximum,
  days,
}: {
  code: string;
  maximum: number;
  days: RsvpDay[];
}) {
  const openDays = days.filter((day) => day.open);
  const closedDays = days.filter((day) => !day.open);
  return (
    <>
      <div className="rsvp-grid">
        {openDays.map((day) => (
          <RsvpRow
            key={`${day.date}-${day.version}`}
            code={code}
            maximum={maximum}
            day={day}
          />
        ))}
      </div>
      {!openDays.length && <p>No days are currently open for RSVP.</p>}
      {closedDays.length > 0 && (
        <section className="rsvp-closed" aria-labelledby="closed-rsvp-heading">
          <h2 id="closed-rsvp-heading">Closed RSVP days</h2>
          <ul>
            {closedDays.map((day) => (
              <li key={day.date}>
                <span>
                  <strong>{day.label}</strong> · {day.date}
                </span>
                <span className="muted small">RSVP closed</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
function RsvpRow({
  code,
  maximum,
  day,
}: {
  code: string;
  maximum: number;
  day: RsvpDay;
}) {
  const [message, setMessage] = useState(""),
    [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form
      className="panel rsvp-card"
      onSubmit={(e) => {
        e.preventDefault();
        const attendees = Number(
          new FormData(e.currentTarget).get("attendees"),
        );
        start(async () => {
          try {
            const result = await saveRsvp({
              code,
              date: day.date,
              attendees,
              version: day.version,
            });
            setMessage(
              result.ok ? "RSVP saved." : (result.error ?? "Could not save."),
            );
            if (result.ok) router.refresh();
          } catch {
            setMessage("Check your connection and try again.");
          }
        });
      }}
    >
      <h2>{day.label}</h2>
      <p>{day.date}</p>
      <label>
        Attendees
        <input
          name="attendees"
          type="number"
          required
          min={0}
          max={maximum}
          defaultValue={day.attendees}
          disabled={!day.open || pending}
        />
      </label>
      <p className="small">Maximum {maximum} registered members</p>
      <button className="button" disabled={!day.open || pending}>
        {!day.open ? "RSVP closed" : pending ? "Saving…" : "Save RSVP"}
      </button>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
    </form>
  );
}
