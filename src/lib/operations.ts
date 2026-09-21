import { z } from "zod";
import { entrySchema, type Entry, type Vendor } from "./finance";
import type { Flat, Day, Festival } from "./types";
export { financeCategories } from "./categories";
export const eventCategories = [
  "Mahila Aarati",
  "Veshbusha",
  "Prasad distribution",
  "Cultural programme",
  "Other",
] as const;
export const participantCategories = [
  "Adult",
  "Child",
  "Family / group",
  "Other",
] as const;
const version = z.number().int().min(0);
const count = z.number().int().min(0).max(500);
const money = z.number().int().min(0).max(100000000);
const otherDetail = { category_other: z.string().trim().max(120).default("") };
const otherValid = (v: { category: string; category_other: string }) =>
  v.category === "Other"
    ? v.category_other.length >= 2
    : v.category_other === "";
export const attendanceSchema = z.object({
  id: z.uuid(),
  service_id: z.uuid(),
  flat_id: z.uuid(),
  version,
  adults: count,
  children: count,
  under_seven: count,
  guest_adults: count,
  guest_children: count,
  guest_under_seven: count,
  confirmed: z.boolean(),
  note: z.string().trim().max(300),
});
export const eventSchema = z
  .object({
    id: z.uuid(),
    festival_id: z.uuid(),
    version,
    title: z.string().trim().min(2).max(100),
    service_date: z.iso.date(),
    category: z.enum(eventCategories),
    ...otherDetail,
    registration_closed: z.boolean(),
  })
  .refine(
    otherValid,
    "Describe Other, or leave its detail blank for a listed category.",
  );
export const participantSchema = z
  .object({
    id: z.uuid(),
    event_id: z.uuid(),
    version,
    flat_id: z.uuid(),
    name: z.string().trim().min(2).max(100),
    category: z.enum(participantCategories),
    ...otherDetail,
    sequence: z.number().int().min(1).max(10000),
    theme: z.string().trim().max(120),
    note: z.string().trim().max(300),
    cancelled: z.boolean(),
  })
  .refine(
    otherValid,
    "Describe Other, or leave its detail blank for a listed category.",
  );
export const cateringSchema = z
  .object({
    id: z.uuid(),
    service_id: z.uuid(),
    version,
    bill_version: version,
    vendor_id: z.uuid(),
    ordered: z.number().int().min(0).max(100000),
    served: z.number().int().min(0).max(100000),
    billed: z.number().int().min(0).max(100000),
    unit_rate: money,
    extras: money,
    note: z.string().trim().max(300),
  })
  .refine(
    (v) => v.billed * v.unit_rate + v.extras <= 100000000,
    "Catering total cannot exceed ₹10,00,000.",
  );
export const schemas = {
  guest_payment: entrySchema.safeExtend({
    payment_mode: z.enum(["collected", "payee_due"]).default("collected"),
    kind: z.literal("collection"),
    category: z.literal("Guest meals"),
    service_id: z.uuid(),
    guest_id: z.uuid().nullable(),
    adults: count.default(0),
    children: count.default(0),
    under_seven: count.default(0),
    note: z.string().trim().max(300).default(""),
  }),
  guest: z.object({
    id: z.uuid(),
    service_id: z.uuid(),
    flat_id: z.uuid(),
    version,
    adults: count,
    children: count,
    under_seven: count,
    note: z.string().trim().max(300),
    cancelled: z.boolean(),
  }),
  resident_checkin: z.object({
    id: z.uuid(),
    service_id: z.uuid(),
    version,
    attended: count,
  }),
  guest_checkin: z.object({
    id: z.uuid(),
    service_id: z.uuid(),
    version,
    attended: z.number().int().min(0).max(1500),
  }),
  event: eventSchema,
  participant: participantSchema,
  catering: cateringSchema,
  event_checkin: z.object({ id: z.uuid(), version, attended: z.boolean() }),
  meal_access: z.object({
    id: z.uuid(),
    version,
    locked: z.boolean(),
    cutoff: z.iso.datetime().nullable(),
    reason: z.string().trim().min(3).max(300),
  }),
  allocation: z.object({
    catering_id: z.uuid(),
    payment_id: z.uuid(),
    amount: money,
    version,
  }),
};
export type Operation = keyof typeof schemas;
export type Service = {
  id: string;
  festival_id: string;
  service_date: string;
  meal: string;
  coverage: string;
  guest_rate: number | null;
  version: number;
  booking_cutoff: string | null;
  attendance_locked: boolean;
};
export type Attendance = z.infer<typeof attendanceSchema> & {
  created_by: string;
  attended: number;
};
export type FestivalEvent = z.infer<typeof eventSchema>;
export type Participant = z.infer<typeof participantSchema> & {
  created_by: string;
  attended: boolean;
};
export type Catering = z.infer<typeof cateringSchema> & {
  created_by: string;
  bill_id: string | null;
};
export type Allocation = {
  catering_id: string;
  payment_id: string;
  amount: number;
  version: number;
};
export type OperationsData = {
  rsvps: {
    enrollment_id: string;
    service_date: string;
    attendees: number;
    version: number;
  }[];
  enrollments: Enrollment[];
  guests: Guest[];
  package_members: {
    entry_id: string;
    enrollment_id: string;
    member_ids: string[];
  }[];
  as_of: string;
  festival: Festival;
  days: Day[];
  flats: Flat[];
  services: Service[];
  attendance: Attendance[];
  events: FestivalEvent[];
  participants: Participant[];
  catering?: Catering[];
  allocations?: Allocation[];
  vendors?: Vendor[];
  finance?: Entry[];
  catering_quantities?: {
    service_id: string;
    ordered: number;
    served: number;
  }[];
};
export const mealTotal = (a: Attendance) =>
  a.adults +
  a.children +
  a.under_seven +
  a.guest_adults +
  a.guest_children +
  a.guest_under_seven;
export const guestTotal = (a: Attendance) =>
  a.guest_adults + a.guest_children + a.guest_under_seven;
export const serviceLabel = (s: Service) =>
  `${s.service_date} · ${s.meal} · ${s.coverage === "fixed" ? "Fixed contribution" : "Per-person package"}`;

export type Resident = {
  id: string;
  name: string;
  age_group: "adult" | "child" | "under_seven";
};
export type Enrollment = {
  contact_phone: string | null;
  rsvp_code: string;
  id: string;
  festival_id: string;
  flat_id: string;
  members: Resident[];
  eligible: boolean;
};
export type Guest = {
  payment_status?: "none" | "pending" | "confirmed" | "payee_due";
  id: string;
  pass_code: string;
  service_id: string;
  flat_id: string;
  adults: number;
  children: number;
  under_seven: number;
  note: string;
  cancelled: boolean;
  attended: number;
  created_by: string;
  version: number;
};

export type GuestDue = {
  id: string;
  vendor_id: string;
  amount: number;
  created_by: string;
  version: number;
  description: string;
  flat_id: string;
  service_id: string;
  cancelled: boolean;
  confirmed: number;
  pending: number;
};

// RSVP is a planning count, not payment eligibility or recorded check-in.
export function expectedDiners(d: OperationsData, a: Attendance) {
  const e = d.enrollments.find((e) => e.id === a.id);
  if (!e) return mealTotal(a);
  const date = d.services.find((s) => s.id === a.service_id)?.service_date;
  const count =
    d.rsvps?.find((r) => r.enrollment_id === e.id && r.service_date === date)
      ?.attendees ?? e.members.length;
  return Math.min(count, mealTotal(a));
}
