import { z } from "zod";
const money = z.number().int().min(0).max(100000000);
export const inviteSchema = z.object({
  can_view_reports: z.boolean().default(false),
  email: z.string().trim().toLowerCase().email().max(254),
  role: z.enum(["admin", "committee"]),
  festival_ids: z.array(z.uuid()).max(100),
});
export const ratesSchema = z.object({
  fixed: money,
  adult: money,
  child: money,
  under_seven: z.literal(0),
  guest: money.nullable(),
  household_policy: z.enum(["unconfirmed", "all_residents"]),
  guest_age_policy: z.enum(["unconfirmed", "same_rate", "under_seven_free"]),
});
export const daySchema = z.object({
  day_number: z.number().int().min(1).max(31),
  service_date: z.iso.date(),
  label: z.string().trim().min(1).max(60),
});
export const festivalSchema = z
  .object({
    id: z.uuid().optional(),
    name: z.string().trim().min(2).max(100),
    start_date: z.iso.date(),
    day_count: z.number().int().min(1).max(31),
    status: z.enum(["draft", "ready"]),
    version: z.number().int().min(0),
    rates: ratesSchema,
    days: z.array(daySchema).min(1).max(31),
    flat_ids: z.array(z.uuid()).max(2000),
    member_ids: z.array(z.uuid()).max(100),
  })
  .superRefine((value, ctx) => {
    const error = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (value.days.length !== value.day_count)
      error("There must be one calendar row for each day.");
    if (
      new Set(value.days.map((d) => d.service_date)).size !== value.days.length
    )
      error("Each day needs a different date.");
    if (
      value.days.some(
        (d, i) =>
          d.day_number !== i + 1 ||
          (i > 0 && d.service_date <= value.days[i - 1].service_date),
      )
    )
      error("Festival days must be numbered and dated in order.");
    if (value.days[0]?.service_date !== value.start_date)
      error("The first day must match the start date.");
    if (
      value.status === "ready" &&
      (value.rates.guest === null ||
        value.rates.household_policy === "unconfirmed" ||
        value.rates.guest_age_policy === "unconfirmed" ||
        !value.flat_ids.length)
    )
      error("To mark setup ready, choose flats, guest rate and meal policies.");
  });
export const blockSchema = z.object({
  block: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{1,12}$/),
  flats: z
    .array(
      z
        .string()
        .trim()
        .regex(/^[A-Za-z0-9-]{1,12}$/),
    )
    .min(1)
    .max(500),
});
export function rupeesToPaise(input: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(input))
    throw new Error("Enter an amount with at most two decimal places.");
  const [whole, fraction = ""] = input.split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(result) || result > 100000000)
    throw new Error("Amount is too large.");
  return result;
}
export function makeDays(
  start: string,
  count: number,
): z.infer<typeof daySchema>[] {
  const date = new Date(`${start}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) return [];
  return Array.from({ length: count }, (_, i) => ({
    day_number: i + 1,
    service_date: new Date(date.getTime() + i * 86400000)
      .toISOString()
      .slice(0, 10),
    label: `Day ${i + 1}`,
  }));
}
