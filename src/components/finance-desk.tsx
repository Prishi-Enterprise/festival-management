"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createResource, reviewEntry, saveEntry } from "@/app/desk/actions";
import {
  inr,
  kindLabels,
  kinds,
  type Account,
  type Entry,
  type EntryKind,
  type Overview,
  type Vendor,
} from "@/lib/finance";
import { financeCategories } from "@/lib/categories";
import { rupeesToPaise } from "@/lib/validation";
import type { Flat, Member } from "@/lib/types";
type Props = {
  festivalId: string;
  member: Member;
  entries: Entry[];
  accounts: Account[];
  vendors: Vendor[];
  overview: Overview;
  flats: Flat[];
  people: Member[];
};
export function FinanceDesk(p: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<Entry | null>(null);
  const [category, setCategory] = useState<string>("Guest meals");
  const [kind, setKind] = useState<EntryKind>("collection");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [review, setReview] = useState<{
    entry: Entry;
    action: "confirm" | "unlock" | "void";
  } | null>(null);
  const [resource, setResource] = useState<"account" | "vendor">("account");
  const [resourceId, setResourceId] = useState<string | null>(null);
  const [filter, setFilter] = useState("pending");
  const admin = p.member.role === "admin";
  const flatName = (id: string | null) => {
    const f = p.flats.find((f) => f.id === id);
    return f ? `${f.block}–${f.flat_number}` : "—";
  };
  const accountName = (id: string | null) =>
    p.accounts.find((a) => a.id === id)?.label ?? "—";
  const hasAccount = !["bill", "charge"].includes(kind);
  const hasFlat = ["collection", "charge", "refund"].includes(kind);
  const hasVendor = ["bill", "payment"].includes(kind);
  function reset() {
    setEditing(null);
    setKind("collection");
    setCategory("Guest meals");
    setRequestId(null);
    setFormKey((k) => k + 1);
  }
  function save(form: FormData) {
    if (
      kind === "collection" &&
      ["Fixed contribution", "Meal package"].includes(category)
    ) {
      router.push(
        `/desk/${p.festivalId}/payments${editing ? `?entry=${editing.id}` : ""}`,
      );
      return;
    }
    let amount: number;
    try {
      amount = rupeesToPaise(String(form.get("amount")));
    } catch {
      setNotice("Enter an exact rupee amount with up to two decimal places.");
      return;
    }
    const id = requestId ?? crypto.randomUUID();
    setRequestId(id);
    setNotice("");
    start(async () => {
      const result = await saveEntry({
        id: editing?.id ?? id,
        festival_id: p.festivalId,
        version: editing?.version ?? 0,
        kind,
        amount,
        occurred_on: form.get("occurred_on"),
        description: form.get("description"),
        category,
        category_other: category === "Other" ? form.get("category_other") : "",
        reference: form.get("reference") ?? "",
        account_id: hasAccount ? form.get("account_id") : null,
        to_account_id: kind === "transfer" ? form.get("to_account_id") : null,
        flat_id: hasFlat ? form.get("flat_id") : null,
        vendor_id: hasVendor ? form.get("vendor_id") : null,
      });
      if (!result.ok) {
        setNotice(result.error ?? "Could not save.");
        return;
      }
      reset();
      setNotice("Entry saved. Awaiting admin confirmation.");
      router.refresh();
    });
  }
  return (
    <>
      <div className="entry-actions">
        <Link className="button" href={`/desk/${p.festivalId}/payments`}>
          Fixed / meal-package payment
        </Link>
        <Link
          className="button secondary"
          href={`/desk/${p.festivalId}/attendance`}
        >
          Attendance & guests
        </Link>
        <Link
          className="button secondary"
          href={`/desk/${p.festivalId}/operations`}
        >
          Catering & events
        </Link>
      </div>
      <section className="finance-stats" aria-label="General overview">
        {[
          ["Collections", p.overview.collections],
          ["Expense bills", p.overview.expenses],
          ["Payments to suppliers", p.overview.payments],
          ["Cash held", p.overview.cash],
          ["Online held", p.overview.online],
        ].map(([label, value]) => (
          <div className="panel" key={String(label)}>
            <small>{label}</small>
            <strong>{inr(Number(value))}</strong>
          </div>
        ))}
      </section>
      <p className="muted">
        {p.overview.pending} entries awaiting confirmation. Bills record costs;
        supplier payments record money paid, including advances.
      </p>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <div className="finance-columns">
        <section className="panel finance-form">
          <h2>
            {editing ? `Edit entry #${editing.number}` : "Record an entry"}
          </h2>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              save(new FormData(event.currentTarget));
            }}
            key={formKey}
          >
            <fieldset disabled={pending}>
              <label>
                Entry type
                <select
                  value={kind}
                  onChange={(e) => {
                    setKind(e.target.value as EntryKind);
                    setCategory(
                      (
                        {
                          collection: "Guest meals",
                          donation: "Donation",
                          transfer: "Transfer",
                          opening: "Opening funds",
                          refund: "Refund",
                        } as Record<string, string>
                      )[e.target.value] ?? "Other",
                    );
                  }}
                >
                  {kinds
                    .filter((k) => admin || !["opening", "charge"].includes(k))
                    .map((k) => (
                      <option key={k} value={k}>
                        {k === "collection"
                          ? "Guest / other flat receipt"
                          : kindLabels[k]}
                      </option>
                    ))}
                </select>
              </label>
              <div className="form-grid">
                <label>
                  Date
                  <input
                    name="occurred_on"
                    type="date"
                    required
                    defaultValue={
                      editing?.occurred_on ??
                      new Intl.DateTimeFormat("en-CA", {
                        timeZone: "Asia/Kolkata",
                      }).format(new Date())
                    }
                  />
                </label>
                <label>
                  Amount (₹)
                  <input
                    name="amount"
                    inputMode="decimal"
                    required
                    min="0.01"
                    max="1000000"
                    step="0.01"
                    type="number"
                    defaultValue={editing ? editing.amount / 100 : undefined}
                  />
                </label>
              </div>
              {hasFlat && (
                <label>
                  Flat
                  <select
                    name="flat_id"
                    required
                    defaultValue={editing?.flat_id ?? ""}
                  >
                    <option value="">Choose a flat</option>
                    {p.flats.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.block}–{f.flat_number}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {hasVendor && (
                <label>
                  Supplier / reimbursement payee
                  <select
                    name="vendor_id"
                    required
                    defaultValue={editing?.vendor_id ?? ""}
                  >
                    <option value="">Choose a payee</option>
                    {p.vendors.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {hasAccount && (
                <label>
                  {["payment", "refund", "transfer"].includes(kind)
                    ? "Paid from"
                    : "Received into"}
                  <select
                    name="account_id"
                    required
                    defaultValue={editing?.account_id ?? ""}
                  >
                    <option value="">Choose cash / online account</option>
                    {p.accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label} · {a.method}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {kind === "transfer" && (
                <label>
                  Transferred to
                  <select
                    name="to_account_id"
                    required
                    defaultValue={editing?.to_account_id ?? ""}
                  >
                    <option value="">Choose destination</option>
                    {p.accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label} · {a.method}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Description
                <input
                  name="description"
                  required
                  minLength={2}
                  maxLength={300}
                  defaultValue={editing?.description}
                  placeholder={
                    kind === "payment"
                      ? "e.g. Caterer advance for day 1"
                      : "What is this entry for?"
                  }
                />
              </label>
              <div className="form-grid">
                <label>
                  Category
                  <select
                    name="category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    required
                  >
                    {financeCategories
                      .filter(
                        (c) =>
                          kind !== "collection" ||
                          !["Fixed contribution", "Meal package"].includes(c),
                      )
                      .map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                  </select>
                </label>
                {category === "Other" && (
                  <label>
                    Other category
                    <input
                      name="category_other"
                      required
                      minLength={2}
                      maxLength={120}
                      defaultValue={editing?.category_other ?? ""}
                    />
                  </label>
                )}
                <label>
                  Reference
                  <input
                    name="reference"
                    maxLength={100}
                    defaultValue={editing?.reference}
                    placeholder="UPI reference / bill number"
                  />
                </label>
              </div>
              <button className="button">
                {pending
                  ? "Saving…"
                  : kind === "collection" &&
                      ["Fixed contribution", "Meal package"].includes(category)
                    ? "Continue to attendees & payment"
                    : "Save for confirmation"}
              </button>
              {editing && (
                <button
                  type="button"
                  className="button secondary"
                  onClick={reset}
                >
                  Cancel edit
                </button>
              )}
            </fieldset>
          </form>
          <p className="small muted">
            Cash and online split payments are separate entries. A bill has no
            cash impact until a supplier payment is recorded.
          </p>
        </section>
        {admin && (
          <section className="panel finance-form">
            <h2>Money holders & payees</h2>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                const id = resourceId ?? crypto.randomUUID();
                setResourceId(id);
                start(async () => {
                  const result = await createResource({
                    id,
                    festival_id: p.festivalId,
                    kind: resource,
                    label: form.get("label"),
                    method: form.get("method"),
                    holder_id: form.get("holder_id"),
                  });
                  setNotice(
                    result.ok
                      ? "Account / payee added."
                      : (result.error ?? "Could not save."),
                  );
                  if (result.ok) {
                    setResourceId(null);
                    router.refresh();
                  }
                });
              }}
            >
              <fieldset disabled={pending}>
                <label>
                  Add
                  <select
                    value={resource}
                    onChange={(e) => {
                      setResource(e.target.value as "account" | "vendor");
                      setResourceId(null);
                    }}
                  >
                    <option value="account">Cash / online account</option>
                    <option value="vendor">
                      Supplier / reimbursement payee
                    </option>
                  </select>
                </label>
                <label>
                  Name
                  <input
                    name="label"
                    required
                    minLength={2}
                    maxLength={100}
                    placeholder={
                      resource === "account" ? "Shivam · cash" : "Caterer name"
                    }
                  />
                </label>
                {resource === "account" && (
                  <>
                    <label>
                      Payment method
                      <select name="method">
                        <option value="cash">Cash</option>
                        <option value="online">Online / bank / UPI</option>
                      </select>
                    </label>
                    <label>
                      Holder
                      <select name="holder_id" required>
                        {p.people.map((m) => (
                          <option key={m.user_id} value={m.user_id}>
                            {m.display_name || m.email}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
                <button className="button secondary">
                  Add {resource === "account" ? "account" : "payee"}
                </button>
              </fieldset>
            </form>
            <p className="small muted">
              Record existing funds as an opening entry, then confirm it. Only
              assigned committee members or admins can hold an account.
            </p>
            <ul className="resource-list">
              {p.accounts.map((a) => (
                <li key={a.id}>
                  {a.label}
                  <span className="badge">{a.method}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <section className="panel finance-register">
        <div className="section-heading">
          <h2>{admin ? "Entry review" : "My entries"}</h2>
          <label>
            Status
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="pending">Awaiting confirmation</option>
              <option value="confirmed">Confirmed & locked</option>
              <option value="void">Voided</option>
              <option value="all">All entries</option>
            </select>
          </label>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>No. / date</th>
                <th>Entry</th>
                <th>Flat / payee</th>
                <th>Account</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {p.entries
                .filter((e) => filter === "all" || e.status === filter)
                .map((e) => (
                  <tr key={e.id}>
                    <td>
                      #{e.number}
                      <small>{e.occurred_on}</small>
                    </td>
                    <td>
                      {kindLabels[e.kind]}
                      <small>{e.description}</small>
                      {e.reference && <small>Ref: {e.reference}</small>}
                    </td>
                    <td>
                      {e.flat_id
                        ? flatName(e.flat_id)
                        : (p.vendors.find((v) => v.id === e.vendor_id)?.name ??
                          "—")}
                    </td>
                    <td>
                      {accountName(e.account_id)}
                      {e.to_account_id && (
                        <small>→ {accountName(e.to_account_id)}</small>
                      )}
                    </td>
                    <td>{inr(e.amount)}</td>
                    <td>
                      <span className="badge">{e.status}</span>
                    </td>
                    <td>
                      <div className="entry-actions">
                        {e.status === "pending" &&
                          e.created_by === p.member.user_id && (
                            <button
                              className="text-button"
                              disabled={pending}
                              onClick={() => {
                                if (
                                  e.kind === "collection" &&
                                  [
                                    "Fixed contribution",
                                    "Meal package",
                                  ].includes(e.category)
                                ) {
                                  router.push(
                                    `/desk/${p.festivalId}/payments?entry=${e.id}`,
                                  );
                                  return;
                                }
                                setEditing(e);
                                setCategory(e.category);
                                setKind(e.kind);
                                setRequestId(null);
                                setFormKey((k) => k + 1);
                              }}
                            >
                              Edit
                            </button>
                          )}
                        {admin && e.status !== "void" && (
                          <button
                            className="text-button"
                            disabled={pending}
                            onClick={() =>
                              setReview({
                                entry: e,
                                action:
                                  e.status === "pending" ? "confirm" : "unlock",
                              })
                            }
                          >
                            {e.status === "pending"
                              ? "Confirm & lock"
                              : "Unlock"}
                          </button>
                        )}
                        {e.status === "pending" &&
                          (admin || e.created_by === p.member.user_id) && (
                            <button
                              className="text-button"
                              disabled={pending}
                              onClick={() =>
                                setReview({ entry: e, action: "void" })
                              }
                            >
                              Void
                            </button>
                          )}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {!p.entries.some((e) => filter === "all" || e.status === filter) && (
          <p className="empty-state">No entries in this view.</p>
        )}
      </section>
      {review && (
        <section className="panel review-panel" aria-label="Review entry">
          <h2>
            {review.action === "confirm"
              ? "Confirm and lock"
              : review.action === "unlock"
                ? "Unlock for correction"
                : "Void entry"}{" "}
            #{review.entry.number}
          </h2>
          <p>
            {kindLabels[review.entry.kind]} · {inr(review.entry.amount)} ·{" "}
            {review.entry.description}
          </p>
          <p className="muted">
            {review.action === "confirm"
              ? "This revision will count in approved reports and become read-only."
              : review.action === "unlock"
                ? "This revision will be reversed out of approved totals. Its creator can correct it, then it needs confirmation again."
                : "The pending entry will remain in history and will not affect balances."}
          </p>
          <form
            action={(form) =>
              start(async () => {
                const result = await reviewEntry({
                  id: review.entry.id,
                  version: review.entry.version,
                  action: review.action,
                  reason: String(form.get("reason") ?? ""),
                });
                setNotice(
                  result.ok
                    ? "Review saved."
                    : (result.error ?? "Could not review."),
                );
                if (result.ok) {
                  setReview(null);
                  router.refresh();
                }
              })
            }
          >
            {review.action !== "confirm" && (
              <label>
                Reason
                <input name="reason" required minLength={3} maxLength={300} />
              </label>
            )}
            <button className="button" disabled={pending}>
              {review.action === "confirm" ? "Confirm & lock" : "Save review"}
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={() => setReview(null)}
              disabled={pending}
            >
              Cancel
            </button>
          </form>
        </section>
      )}
    </>
  );
}
