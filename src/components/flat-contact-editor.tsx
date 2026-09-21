"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateFlatContact } from "@/app/desk/flat-payment-actions";
export function FlatContactEditor({
  id,
  phone,
}: {
  id: string;
  phone: string | null;
}) {
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <section className="panel" id="flat-contact">
      <h2>Flat contact phone number</h2>
      <p>
        This contact is shared by the flat’s fixed contribution, meal package
        and daily RSVP. Save contact changes separately from the payment.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const value = String(
            new FormData(event.currentTarget).get("phone"),
          ).replace(/[\s()-]/g, "");
          setMessage("");
          start(async () => {
            try {
              const result = await updateFlatContact({
                id,
                phone: value,
                rotate: false,
              });
              setMessage(
                result.ok
                  ? "Contact saved."
                  : (result.error ?? "Could not save contact."),
              );
              if (result.ok) router.refresh();
            } catch {
              setMessage("Could not save contact. Please try again.");
            }
          });
        }}
      >
        <label>
          Contact phone
          <input
            key={id}
            name="phone"
            type="tel"
            autoComplete="tel"
            defaultValue={phone ?? ""}
            required
            maxLength={20}
            placeholder="+919876543210"
            disabled={pending}
          />
          <small>
            Include country code (+91 for India). The existing RSVP link stays
            the same.
          </small>
        </label>
        <div className="form-actions">
          <button className="button secondary" disabled={pending}>
            {pending ? "Saving…" : "Save contact"}
          </button>
        </div>
        {message && (
          <p className="notice" role="status">
            {message}
          </p>
        )}
      </form>
    </section>
  );
}
