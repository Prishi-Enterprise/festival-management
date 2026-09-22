import { z } from "zod";
import type { OperationsData } from "./operations";
export const attendanceQuerySchema = z
  .object({
    service: z.uuid().optional(),
    resident_search: z.string().max(120).default(""),
    guest_search: z.string().max(120).default(""),
    resident_page: z.coerce.number().int().min(0).max(100000).default(0),
    guest_page: z.coerce.number().int().min(0).max(100000).default(0),
    code: z.uuid().optional(),
    kind: z.enum(["resident", "guest"]).optional(),
    guest: z.uuid().optional(),
  })
  .refine(
    (q) => Boolean(q.code) === Boolean(q.kind),
    "Pass kind and code are required together.",
  );
export type AttendanceData = Pick<
  OperationsData,
  | "festival"
  | "services"
  | "flats"
  | "enrollments"
  | "attendance"
  | "guests"
  | "age_brackets"
  | "as_of"
> & {
  selected_service_id: string | null;
  resident_list: { total: number; page: number; pages: number };
  guest_list: { total: number; page: number; pages: number };
  totals: { eligible: number; rsvped: number; attended: number };
};
