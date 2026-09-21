"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { OperationForm, type Field } from "./operation-form";
import {
  type GuestDue,
  type OperationsData,
} from "@/lib/operations";
import { inr, type Account, type Entry, type Vendor } from "@/lib/finance";
export function GuestPaymentForm({
  data: d,
  accounts,
  entry,
  initialGuest,
  vendors,
  dues,
  dueEntry,
  userId,
}: {
  data: OperationsData;
  accounts: Account[];
  entry: Entry | null;
  initialGuest?: string;
  vendors: Vendor[];
  dues: GuestDue[];
  dueEntry?: GuestDue;
  userId: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState(dueEntry ? "payee_due" : "collected");
  const [guestId, setGuestId] = useState(initialGuest ?? "");
  const guest = d.guests.find((g) => g.id === guestId);
  const packages = d.guest_packages ?? [];
  const [packageId, setPackageId] = useState(
    guest?.package_id ?? packages.find((p) => p.active)?.id ?? "",
  );
  const selectedPackage = packages.find((p) => p.id === packageId);
  const services = d.services.filter(
    (s) => s.coverage !== "not_served" && s.guest_rate !== null,
  );
  const [serviceId, setServiceId] = useState(
    guest?.service_id ??
      selectedPackage?.service_ids[0] ??
      services[0]?.id ??
      "",
  );
  const [saved, setSaved] = useState(false);
  const linked = !!entry?.guest_receipt_links || !!dueEntry;
  const label = (id: string) => {
    const f = d.flats.find((f) => f.id === id);
    return f ? `${f.block}–${f.flat_number}` : "";
  };
  const fields: Field[] = [
    ...(!guest
      ? [
          {
            name: "flat_id",
            label: "Host flat",
            type: "select" as const,
            options: d.flats
              .filter((f) => !entry || f.id === entry.flat_id)
              .map((f) => ({ value: f.id, label: label(f.id) })),
          },
          {
            name: "adults",
            label: `Guests above ${d.age_brackets?.child_max_age ?? 10}`,
            type: "number" as const,
            required: true,
          },
          {
            name: "children",
            label: `Guests aged ${d.age_brackets?.child_min_age ?? 7}–${d.age_brackets?.child_max_age ?? 10}`,
            type: "number" as const,
            required: true,
          },
          {
            name: "under_seven",
            label: `Guests under ${d.age_brackets?.child_min_age ?? 7}`,
            type: "number" as const,
            required: true,
          },
        ]
      : []),
    {
      name: "occurred_on",
      label: "Entry date",
      type: "date",
      required: true,
    },
    {
      name: "amount",
      label:
        mode === "payee_due"
          ? "Amount owed by payee (₹)"
          : "Amount received (₹)",
      type: "money",
      required: true,
      hint:
        mode === "payee_due"
          ? "This is owed to the festival. It is not a reimbursement expense or cash received."
          : "Enter the amount collected in this receipt. Split payments may use the same pass.",
    },
    {
      name: mode === "payee_due" ? "vendor_id" : "account_id",
      label:
        mode === "payee_due"
          ? "Payee owing the guest fee"
          : "Receiving account",
      type: "select",
      options:
        mode === "payee_due"
          ? vendors.map((v) => ({ value: v.id, label: v.name }))
          : accounts.map((a) => ({
              value: a.id,
              label: `${a.label} · ${a.method}`,
            })),
    },
    { name: "description", label: "Description", required: true, max: 300 },
    { name: "reference", label: "Payment reference", max: 100 },
  ];
  return (
    <>
      <h1>Guest meal payment & pass</h1>
      <p>
        Record cash/online received or a guest fee owed by a payee. Saving
        creates the pass immediately; guests may check in before admin
        confirmation.
      </p>
      {!packages.some((p) => p.active) && !guest ? (
        <p className="notice">
          Ask an admin to configure a guest-pass package first.
        </p>
      ) : saved ? (
        <section className="panel">
          <p role="status">
            Guest entry saved and linked to its pass.{" "}
            {mode === "payee_due"
              ? "The payee owes this amount until collection is reconciled."
              : "The receipt awaits admin confirmation."}
          </p>
          <Link
            className="button"
            href={`/desk/${d.festival.id}/attendance?service=${serviceId}`}
          >
            View guest pass in attendance
          </Link>
          <Link className="button secondary" href={`/desk/${d.festival.id}`}>
            Back to finance
          </Link>
        </section>
      ) : (
        <section className="panel finance-form">
          <label>
            Payment handling
            <select
              value={mode}
              disabled={!!entry || !!dueEntry}
              onChange={(e) => setMode(e.target.value)}
            >
              <option value="collected">Received in cash / online</option>
              <option value="payee_due">Payee owes fee — collect later</option>
            </select>
          </label>
          {(mode === "collected" ? !accounts.length : !vendors.length) && (
            <p className="notice">
              Ask an admin to add a{" "}
              {mode === "collected"
                ? "cash/online account"
                : "supplier/reimbursement payee"}{" "}
              under Money holders & payees first.
            </p>
          )}
          <label>
            Guest-pass package
            <select
              value={packageId}
              disabled={linked || !!initialGuest}
              onChange={(e) => {
                setPackageId(e.target.value);
                setServiceId(
                  packages.find((p) => p.id === e.target.value)
                    ?.service_ids[0] ?? "",
                );
                setGuestId("");
              }}
            >
              {guest && !guest.package_id && (
                <option value="">Existing single-meal pass</option>
              )}
              {packages
                .filter((p) => p.active || p.id === guest?.package_id)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.service_date} · {inr(p.price)} / guest
                  </option>
                ))}
            </select>
          </label>
          {selectedPackage && (
            <p>
              Included meals:{" "}
              {(guest?.included_services ?? selectedPackage.service_ids)
                .map((id) => d.services.find((s) => s.id === id)?.meal)
                .join(" + ")}
              . Price: {inr(guest?.unit_price ?? selectedPackage.price)} per
              guest. Children in the free age bracket follow the festival
              guest-age policy.
            </p>
          )}
          <label>
            Guest pass
            <select
              value={guestId}
              disabled={linked}
              onChange={(e) => setGuestId(e.target.value)}
            >
              <option value="">Create a new pass with this entry</option>
              {d.guests
                .filter(
                  (g) =>
                    (packageId
                      ? g.package_id === packageId
                      : g.service_id === serviceId) &&
                    (!g.cancelled || g.id === initialGuest) &&
                    (!entry || g.flat_id === entry.flat_id),
                )
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {label(g.flat_id)} · {g.adults + g.children + g.under_seven}{" "}
                    guests · {g.pass_code}
                  </option>
                ))}
            </select>
          </label>
          {guest && (
            <p>
              Payment for {label(guest.flat_id)} ·{" "}
              {guest.adults + guest.children + guest.under_seven} guests. This
              reuses the existing pass.
            </p>
          )}
          <OperationForm
            key={`${packageId}-${serviceId}-${guestId}-${mode}`}
            operation="guest_payment"
            base={{
              ...(entry ?? {}),
              ...(dueEntry ?? {}),
              payment_mode: mode,
              account_id: entry?.account_id ?? null,
              amount: entry?.amount ?? dueEntry?.amount ?? 0,
              festival_id: d.festival.id,
              version: entry?.version ?? dueEntry?.version ?? 0,
              kind: "collection",
              category: "Guest meals",
              category_other: "",
              flat_id: guest?.flat_id ?? entry?.flat_id,
              service_id: guest?.service_id ?? serviceId,
              package_id: guest?.package_id ?? (packageId || null),
              guest_id: guestId || null,
              to_account_id: null,
              vendor_id: dueEntry?.vendor_id ?? null,
              occurred_on:
                entry?.occurred_on ??
                new Date().toLocaleDateString("en-CA", {
                  timeZone: "Asia/Kolkata",
                }),
              description:
                entry?.description ??
                dueEntry?.description ??
                "Guest meal payment",
              reference: entry?.reference ?? "",
            }}
            fields={fields}
            button="Save entry & guest pass"
            onSaved={(savedEntry) => {
              setSaved(true);
              router.push(
                `/desk/${d.festival.id}/attendance?service=${serviceId}&guest=${savedEntry.guest_id || savedEntry.id}`,
              );
            }}
          />
        </section>
      )}
      {dues.length > 0 && (
        <section className="panel finance-register">
          <h2>Guest fees owed by payees</h2>
          <p>
            Only confirmed cash/online receipts reduce outstanding dues. Pending
            receipts reserve the amount to prevent duplicate collection. These
            dues are separate from supplier bills and reimbursements.
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Flat / payee</th>
                  <th>Owed</th>
                  <th>Confirmed collection</th>
                  <th>Pending collection</th>
                  <th>Outstanding</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {dues.map((due) => (
                  <tr key={due.id}>
                    <td>
                      {label(due.flat_id)} ·{" "}
                      {vendors.find((v) => v.id === due.vendor_id)?.name}
                      {due.cancelled && " · Pass cancelled"}
                    </td>
                    <td>{inr(due.amount)}</td>
                    <td>{inr(due.confirmed)}</td>
                    <td>{inr(due.pending)}</td>
                    <td>{inr(due.amount - due.confirmed)}</td>
                    <td>
                      <Link
                        href={`/desk/${d.festival.id}/guest-payments?guest=${due.id}`}
                      >
                        Record settlement
                      </Link>
                      {due.created_by === userId &&
                        due.confirmed === 0 &&
                        due.pending === 0 && (
                          <Link
                            href={`/desk/${d.festival.id}/guest-payments?due=${due.id}`}
                          >
                            {" "}
                            · Edit due
                          </Link>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
