"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { OperationsData } from "@/lib/operations";
import { updateFlatContact } from "@/app/desk/flat-payment-actions";
export function RsvpContacts({
  data,
  admin,
  baseUrl,
}: {
  data: OperationsData;
  admin: boolean;
  baseUrl: string;
}) {
  const [search, setSearch] = useState(""),
    [page, setPage] = useState(0),
    [message, setMessage] = useState(""),
    [pending, start] = useTransition();
  const router = useRouter();
  const rows = data.enrollments.filter((e) => {
    const f = data.flats.find((f) => f.id === e.flat_id);
    return `${f?.block} ${f?.flat_number} ${e.contact_phone ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase());
  });
  const current = Math.min(page, Math.max(0, Math.ceil(rows.length / 10) - 1));
  return (
    <section className="panel">
      <h2>Flat contacts & daily RSVP</h2>
      <p>
        Share the private link with the registered contact. No sign-in is
        required. All registered members are RSVPed by default.
      </p>
      <label>
        Search flat or phone
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          type="search"
        />
      </label>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      {rows.slice(current * 10, current * 10 + 10).map((e) => {
        const f = data.flats.find((f) => f.id === e.flat_id),
          url = `${baseUrl}/rsvp/${e.rsvp_code}`;
        return (
          <div className="panel" key={e.id}>
            <h3>
              {f?.block}–{f?.flat_number} · {e.members.length} registered
              members
            </h3>
            {e.attendance_code && (
              <p>
                <a
                  className="text-link"
                  href={`${baseUrl}/resident-pass/${e.attendance_code}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open resident QR pass
                </a>
              </p>
            )}
            <div className="rsvp-contact">
              <span>{e.contact_phone ?? "Contact number needed"}</span>
              {e.contact_phone && (
                <>
                  <a
                    className="text-link"
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open RSVP
                  </a>
                  <button
                    className="text-button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(url);
                        setMessage(
                          "Private RSVP link copied. Share it only with this flat’s contact.",
                        );
                      } catch {
                        setMessage(`Copy this link: ${url}`);
                      }
                    }}
                  >
                    Copy private link
                  </button>
                  <a
                    className="text-link"
                    href={`https://wa.me/${e.contact_phone.replace("+", "")}?text=${encodeURIComponent(`Your daily RSVP for ${data.festival.name}: ${url}`)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Share on WhatsApp
                  </a>
                </>
              )}
            </div>
            {admin && (
              <details>
                <summary>Update contact / replace private link</summary>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const fd = new FormData(event.currentTarget);
                    start(async () => {
                      const result = await updateFlatContact({
                        id: e.id,
                        phone: String(fd.get("phone")).replace(/[\s()-]/g, ""),
                        rotate: fd.get("rotate") === "on",
                      });
                      setMessage(
                        result.ok
                          ? "Contact updated."
                          : (result.error ?? "Could not save."),
                      );
                      if (result.ok) router.refresh();
                    });
                  }}
                >
                  <label>
                    Contact phone
                    <input
                      name="phone"
                      type="tel"
                      required
                      defaultValue={e.contact_phone ?? ""}
                      placeholder="+919876543210"
                    />
                  </label>
                  <label className="checkbox-row">
                    <input type="checkbox" name="rotate" />
                    Replace link (old link will stop working)
                  </label>
                  <button className="button secondary" disabled={pending}>
                    Save contact
                  </button>
                </form>
              </details>
            )}
          </div>
        );
      })}
      <div className="form-actions">
        <button
          className="button secondary"
          disabled={current === 0}
          onClick={() => setPage(current - 1)}
        >
          Previous
        </button>
        <span>
          {rows.length ? current * 10 + 1 : 0}–
          {Math.min((current + 1) * 10, rows.length)} of {rows.length}
        </span>
        <button
          className="button secondary"
          disabled={(current + 1) * 10 >= rows.length}
          onClick={() => setPage(current + 1)}
        >
          Next
        </button>
      </div>
    </section>
  );
}
