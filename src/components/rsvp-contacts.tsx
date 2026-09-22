"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Enrollment } from "@/lib/operations";
import { updateFlatContact } from "@/app/desk/flat-payment-actions";
export function ResidentContactActions({
  enrollment: e,
  admin,
  baseUrl,
  festival,
}: {
  enrollment: Enrollment;
  admin: boolean;
  baseUrl: string;
  festival: string;
}) {
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const url = `${baseUrl}/rsvp/${e.rsvp_code}`;
  return (
    <div className="resident-contact-actions">
      {message && (
        <p role="status" className="tiny">
          {message}
        </p>
      )}
      <div className="rsvp-contact-group">
        <h4>Daily RSVP</h4>
        <p className="rsvp-phone">
          {e.contact_phone ?? "Contact number needed"}
        </p>
        <div className="rsvp-contact">
          {e.contact_phone && (
            <>
              <a
                className="button secondary"
                href={url}
                target="_blank"
                rel="noreferrer"
              >
                Open RSVP
              </a>
              <button
                className="button secondary"
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
                className="button secondary"
                href={`https://wa.me/${e.contact_phone.replace("+", "")}?text=${encodeURIComponent(`Your daily RSVP for ${festival}: ${url}`)}`}
                target="_blank"
                rel="noreferrer"
              >
                Share on WhatsApp
              </a>
            </>
          )}
        </div>
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
}
