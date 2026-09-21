import { z } from "zod";
export const kinds = [
  "collection",
  "donation",
  "bill",
  "payment",
  "transfer",
  "opening",
  "charge",
  "refund",
] as const;
export type EntryKind = (typeof kinds)[number];
export const kindLabels: Record<EntryKind, string> = {
  collection: "Flat payment",
  donation: "Donation",
  bill: "Expense bill",
  payment: "Supplier payment / advance",
  transfer: "Holder transfer",
  opening: "Opening funds",
  charge: "Flat charge",
  refund: "Flat refund",
};
export const entrySchema = z.object({
  id: z.uuid(),
  festival_id: z.uuid(),
  version: z.number().int().min(0),
  kind: z.enum(kinds),
  occurred_on: z.iso.date(),
  amount: z.number().int().min(1).max(100000000),
  description: z.string().trim().min(2).max(300),
  category: z.string().trim().max(80),
  reference: z.string().trim().max(100),
  account_id: z.uuid().nullable(),
  to_account_id: z.uuid().nullable(),
  flat_id: z.uuid().nullable(),
  vendor_id: z.uuid().nullable(),
});
export type EntryInput = z.infer<typeof entrySchema>;
export type Entry = EntryInput & {
  number: number;
  created_by: string;
  status: "pending" | "confirmed" | "void";
  created_at: string;
  confirmed_at: string | null;
};
export type Account = {
  id: string;
  label: string;
  method: "cash" | "online";
  holder_id: string;
};
export type Vendor = { id: string; name: string };
export type Overview = {
  collections: number;
  expenses: number;
  payments: number;
  refunds: number;
  opening: number;
  pending: number;
  cash: number;
  online: number;
};
export type FinanceReport = {
  festival_name: string;
  as_of: string;
  overview: Overview;
  entries: Entry[];
  accounts: (Account & {
    email: string;
    display_name: string;
    balance: number;
  })[];
  vendors: (Vendor & { billed: number; paid: number })[];
  flats: {
    id: string;
    block: string;
    flat_number: string;
    charged: number;
    paid: number;
  }[];
};
export function inr(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(paise / 100);
}
export function csvCell(value: unknown) {
  const text = String(value ?? "");
  return (
    '"' +
    (/^[\s]*[=+\-@]/.test(text) ? "'" + text : text).replaceAll('"', '""') +
    '"'
  );
}
