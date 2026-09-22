"use client";
import { FlatSelector } from "./flat-selector";
import Link from "next/link";
import { FlatContactEditor } from "@/components/flat-contact-editor";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveFlatPayment } from "@/app/desk/flat-payment-actions";
import type { OperationsData, Resident } from "@/lib/operations";
import type { Account, Entry } from "@/lib/finance";
import { rupeesToPaise } from "@/lib/validation";
export function FlatPaymentForm({
  data: d,
  accounts,
  admin = false,
  entry,
  initialPurpose = "Fixed contribution",
}: {
  data: OperationsData;
  accounts: Account[];
  admin?: boolean;
  entry: Entry | null;
  initialPurpose?: "Fixed contribution" | "Meal package";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const request = useRef<string | null>(null);
  const [flat, setFlat] = useState(entry?.flat_id ?? "");
  const [purpose, setPurpose] = useState<string>(
    entry?.category ?? initialPurpose,
  );
  const [members, setMembers] = useState<Resident[]>([]);
  const [selected, setSelected] = useState<string[]>(
    d.package_members.find((p) => p.entry_id === entry?.id)?.member_ids ?? [],
  );
  const enrollment = d.enrollments.find((e) => e.flat_id === flat);
  const fixed = purpose === "Fixed contribution";
  return (
    <>
      <h1>{entry ? "Edit" : "Record"} flat payment</h1>
      <p>
        <Link href={`/desk/${d.festival.id}`}>Back to finance</Link>
      </p>
      <section className="panel finance-form">
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            setMessage("");
            const form = event.currentTarget;
            if (!accounts.length) {
              setMessage(
                "No receiving account is available. Ask an admin to add a cash or online account under Money holders & payees in the finance desk.",
              );
              return;
            }
            const invalidName = members.findIndex(
              (m) => m.name.trim().length < 2 || m.name.trim().length > 100,
            );
            if (fixed && !enrollment && invalidName >= 0) {
              setMessage(
                `Attendee ${invalidName + 1}: enter a name with 2–100 characters.`,
              );
              form
                .querySelector<HTMLInputElement>(
                  `#attendee-name-${invalidName}`,
                )
                ?.focus();
              return;
            }
            if (!form.checkValidity()) {
              const invalid = form.querySelector<
                HTMLInputElement | HTMLSelectElement
              >(":invalid");
              const label =
                invalid?.closest("label")?.childNodes[0]?.textContent?.trim() ||
                "Required field";
              setMessage(
                `${label}: ${invalid?.validationMessage || "Check this field."}`,
              );
              form.reportValidity();
              return;
            }
            if (!enrollment && (!fixed || !members.length)) {
              setMessage(
                fixed
                  ? "Add at least one fixed attendee before saving the contribution."
                  : "Record the fixed contribution and its attendees before adding a meal package.",
              );
              return;
            }
            if (!fixed && !selected.length) {
              setMessage("Select at least one resident for the meal package.");
              return;
            }
            const fd = new FormData(form);
            let amount: number;
            try {
              amount = rupeesToPaise(String(fd.get("amount")));
            } catch {
              setMessage("Enter a valid amount.");
              return;
            }
            request.current ??= crypto.randomUUID();
            start(async () => {
              try {
                const result = await saveFlatPayment({
                  id: entry?.id ?? request.current,
                  festival_id: d.festival.id,
                  version: entry?.version ?? 0,
                  kind: "collection",
                  category: purpose,
                  category_other: "",
                  flat_id: flat,
                  account_id: fd.get("account"),
                  to_account_id: null,
                  vendor_id: null,
                  amount,
                  occurred_on: fd.get("date"),
                  description: fd.get("description"),
                  reference: fd.get("reference"),
                  ...(enrollment
                    ? {}
                    : {
                        members,
                        contact_phone: String(fd.get("contact_phone")).replace(
                          /[\s()-]/g,
                          "",
                        ),
                      }),
                  member_ids: fixed ? [] : selected,
                });
                if (!result.ok) {
                  setMessage(result.error ?? "Could not save.");
                  return;
                }
                router.push(`/desk/${d.festival.id}`);
                router.refresh();
              } catch {
                setMessage(
                  "The save could not be completed. Check your connection and try again. Retrying this form will not duplicate the receipt.",
                );
              }
            });
          }}
        >
          <fieldset disabled={pending}>
            <div className="form-grid">
              <label>
                Payment purpose
                <select
                  value={purpose}
                  disabled={!!entry}
                  onChange={(e) => setPurpose(e.target.value)}
                >
                  <option>Fixed contribution</option>
                  <option>Meal package</option>
                </select>
              </label>
              <FlatSelector
                flats={d.flats}
                value={flat}
                disabled={!!entry}
                onChange={(id) => {
                  setFlat(id);
                  setMembers([]);
                  setSelected([]);
                }}
              />
              <label>
                Receipt date
                <input
                  name="date"
                  type="date"
                  required
                  defaultValue={
                    entry?.occurred_on ??
                    new Date().toLocaleDateString("en-CA", {
                      timeZone: "Asia/Kolkata",
                    })
                  }
                />
              </label>
              <label>
                Amount received (₹)
                <input
                  name="amount"
                  type="number"
                  required
                  min={fixed ? "0.01" : "0"}
                  max="1000000"
                  step="0.01"
                  defaultValue={entry ? entry.amount / 100 : undefined}
                />
              </label>
              <label>
                Receiving account
                <select
                  name="account"
                  required
                  defaultValue={entry?.account_id ?? ""}
                >
                  <option value="">Choose cash / online account</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label} · {a.method}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Description
                <input
                  name="description"
                  required
                  minLength={2}
                  maxLength={300}
                  defaultValue={entry?.description ?? purpose}
                />
              </label>
              <label>
                Payment reference
                <input
                  name="reference"
                  maxLength={100}
                  defaultValue={entry?.reference ?? ""}
                />
              </label>
            </div>
            {fixed && !enrollment && (
              <label>
                Flat contact phone number
                <input
                  name="contact_phone"
                  type="tel"
                  required
                  placeholder="+919876543210"
                  pattern="[+]?[0-9 ()-]{8,20}"
                  maxLength={20}
                />
                <small>
                  Include country code (+91 for India). Used to share this
                  flat’s private daily RSVP link.
                </small>
              </label>
            )}
            {enrollment && (
              <p className="notice">
                Contact: {enrollment.contact_phone ?? "Not yet registered"}.{" "}
                {admin ? (
                  <a href="#flat-contact">Add or update contact below</a>
                ) : (
                  "Ask a society admin to update the contact."
                )}
              </p>
            )}
            <h2>
              {fixed
                ? "Fixed attendees / members"
                : "Select meal-package members"}
            </h2>
            {enrollment ? (
              <>
                <p>
                  Fixed attendees are registered once. Add any extra people
                  through guest registration.
                </p>
                {enrollment.members.map((m) => (
                  <label className="checkbox-row" key={m.id}>
                    {!fixed && (
                      <input
                        type="checkbox"
                        checked={selected.includes(m.id)}
                        onChange={() =>
                          setSelected((s) =>
                            s.includes(m.id)
                              ? s.filter((id) => id !== m.id)
                              : [...s, m.id],
                          )
                        }
                      />
                    )}{" "}
                    {m.name} · {m.age_group.replaceAll("_", " ")}
                  </label>
                ))}
              </>
            ) : fixed ? (
              <>
                <p>
                  Add each resident once. Under-seven children have zero
                  contribution and still count for meals.
                </p>
                {members.map((m, index) => (
                  <div className="form-grid" key={m.id}>
                    <label>
                      Name
                      <input
                        id={`attendee-name-${index}`}
                        aria-invalid={
                          !!message &&
                          (m.name.trim().length < 2 ||
                            m.name.trim().length > 100)
                        }
                        aria-describedby={`attendee-name-error-${index}`}
                        required
                        minLength={2}
                        maxLength={100}
                        value={m.name}
                        onChange={(e) =>
                          setMembers((rows) =>
                            rows.map((r, i) =>
                              i === index ? { ...r, name: e.target.value } : r,
                            ),
                          )
                        }
                      />
                      <span
                        id={`attendee-name-error-${index}`}
                        className="small"
                      >
                        {!!message &&
                        (m.name.trim().length < 2 || m.name.trim().length > 100)
                          ? "Enter a name with 2–100 characters."
                          : ""}
                      </span>
                    </label>
                    <label>
                      Age group
                      <select
                        value={m.age_group}
                        onChange={(e) =>
                          setMembers((rows) =>
                            rows.map((r, i) =>
                              i === index
                                ? {
                                    ...r,
                                    age_group: e.target
                                      .value as Resident["age_group"],
                                  }
                                : r,
                            ),
                          )
                        }
                      >
                        <option value="adult">
                          Above {d.age_brackets?.child_max_age ?? 10}
                        </option>
                        <option value="child">
                          {d.age_brackets?.child_min_age ?? 7}–
                          {d.age_brackets?.child_max_age ?? 10} years
                        </option>
                        <option value="under_seven">
                          Under {d.age_brackets?.child_min_age ?? 7}
                        </option>
                      </select>
                    </label>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() =>
                        setMembers((rows) => rows.filter((_, i) => i !== index))
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="button secondary"
                  disabled={!flat || members.length >= 100}
                  onClick={() =>
                    setMembers((rows) => [
                      ...rows,
                      { id: crypto.randomUUID(), name: "", age_group: "adult" },
                    ])
                  }
                >
                  Add fixed attendee
                </button>
              </>
            ) : (
              <p className="notice">
                Record the fixed contribution and attendees first.
              </p>
            )}
            <p className="small">
              Split cash/online receipts reuse the same attendee list. Admission
              requires confirmed fixed receipts covering the fixed fee; package
              meals additionally require confirmed package enrollment. This form
              records money received; it does not create automatic bills.
            </p>
            {message && (
              <p className="notice error" role="alert">
                {message}
              </p>
            )}
            <button type="submit" className="button" disabled={pending}>
              {pending ? "Saving…" : "Save for confirmation"}
            </button>
          </fieldset>
        </form>
      </section>
      {admin && enrollment && (
        <FlatContactEditor
          key={enrollment.id}
          id={enrollment.id}
          phone={enrollment.contact_phone ?? null}
        />
      )}
    </>
  );
}
