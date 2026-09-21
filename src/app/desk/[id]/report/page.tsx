import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireMember } from "@/lib/auth";
import { inr, kindLabels, type FinanceReport } from "@/lib/finance";
import { PageHeading } from "@/components/page-heading";
import { PrintButton } from "@/components/print-button";
export default async function Report({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { supabase } = await requireMember(true);
  const { data, error } = await supabase.rpc("finance_report", {
    p_festival: id,
  });
  if (error) throw new Error("Could not load financial report.");
  const r = data as FinanceReport;
  const o = r.overview;
  const balance = Number(o.cash) + Number(o.online);
  const expected =
    Number(o.opening) +
    Number(o.collections) -
    Number(o.payments) -
    Number(o.refunds);
  return (
    <>
      <PageHeading
        eyebrow="ADMIN REPORT"
        title={r.festival_name + " · Accounts"}
        description={`Confirmed entries only in totals · As of ${new Date(r.as_of).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST`}
        action={
          <div className="entry-actions">
            <Link className="button secondary" href={`/desk/${id}`}>
              Back to entries
            </Link>
            <PrintButton />
            <Link className="button" href={`/desk/${id}/export`}>
              Download CSV
            </Link>
          </div>
        }
      />
      <p className="notice">
        {o.pending} pending entries excluded. Cash and online closing funds{" "}
        {inr(balance)}.{" "}
        {balance === expected
          ? "Funds reconcile."
          : "Reconciliation difference: " + inr(balance - expected)}
      </p>
      <section className="panel finance-register">
        <h2>Summary</h2>
        <dl className="report-summary">
          {[
            ["Opening funds", o.opening],
            ["Collections and donations", o.collections],
            ["Refunds", o.refunds],
            ["Recognized expense bills", o.expenses],
            ["Supplier payments / advances", o.payments],
            ["Closing funds", balance],
            [
              "Collections less refunds and expenses",
              Number(o.collections) - Number(o.refunds) - Number(o.expenses),
            ],
          ].map(([label, value]) => (
            <div key={String(label)}>
              <dt>{label}</dt>
              <dd>{inr(Number(value))}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="panel finance-register">
        <h2>Money holders</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Account</th>
                <th>Holder</th>
                <th>Method</th>
                <th>Confirmed balance</th>
              </tr>
            </thead>
            <tbody>
              {r.accounts.map((a) => (
                <tr key={a.id}>
                  <td>{a.label}</td>
                  <td>{a.display_name || a.email}</td>
                  <td>{a.method}</td>
                  <td>{inr(a.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel finance-register">
        <h2>Supplier & reimbursement balances</h2>
        <p className="muted">
          A negative balance is an unapplied advance. Payments are not counted
          again as expenses.
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Payee</th>
                <th>Bills</th>
                <th>Paid</th>
                <th>Payable / (advance)</th>
              </tr>
            </thead>
            <tbody>
              {r.vendors.map((v) => (
                <tr key={v.id}>
                  <td>{v.name}</td>
                  <td>{inr(v.billed)}</td>
                  <td>{inr(v.paid)}</td>
                  <td>{inr(v.billed - v.paid)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel finance-register">
        <h2>Flat statements</h2>
        <p className="muted">
          Charges appear when entered and confirmed. A negative due represents a
          credit; an uncharged flat is not automatically marked settled.
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Flat</th>
                <th>Charges</th>
                <th>Net received</th>
                <th>Due / (credit)</th>
              </tr>
            </thead>
            <tbody>
              {r.flats.map((f) => (
                <tr key={f.id}>
                  <td>
                    {f.block}–{f.flat_number}
                  </td>
                  <td>{inr(f.charged)}</td>
                  <td>{inr(f.paid)}</td>
                  <td>{inr(f.charged - f.paid)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel finance-register">
        <h2>Detailed register</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>No.</th>
                <th>Date</th>
                <th>Type</th>
                <th>Description</th>
                <th>Reference</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {r.entries.map((e) => (
                <tr key={e.id}>
                  <td>{e.number}</td>
                  <td>{e.occurred_on}</td>
                  <td>{kindLabels[e.kind]}</td>
                  <td>{e.description}</td>
                  <td>{e.reference}</td>
                  <td>{inr(e.amount)}</td>
                  <td>{e.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
