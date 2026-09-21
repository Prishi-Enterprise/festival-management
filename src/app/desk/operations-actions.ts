"use server";
import { refresh, revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth";
import { schemas, type Operation } from "@/lib/operations";
export async function saveOperation(
  operation: Operation,
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const { supabase } = await requireMember();
  if (!Object.prototype.hasOwnProperty.call(schemas, operation))
    return { ok: false, error: "Invalid operation." };
  const result = schemas[operation].safeParse(input);
  if (!result.success)
    return { ok: false, error: result.error.issues[0].message };
  const p = result.data as Record<string, unknown>;
  const names: Record<Operation, string> = {
    guest: "save_guest_booking",
    resident_checkin: "check_in_residents",
    guest_checkin: "check_in_guest",
    event: "save_festival_event",
    participant: "save_event_participant",
    catering: "save_catering",
    event_checkin: "check_in_event",
    meal_access: "set_meal_access",
    allocation: "allocate_catering_payment",
  };
  let args: Record<string, unknown> = { p_input: p };
  if (operation === "event_checkin")
    args = { p_id: p.id, p_version: p.version, p_attended: p.attended };
  if (operation === "resident_checkin")
    args = {
      p_enrollment: p.id,
      p_service: p.service_id,
      p_version: p.version,
      p_attended: p.attended,
    };
  if (operation === "guest_checkin")
    args = {
      p_id: p.id,
      p_service: p.service_id,
      p_version: p.version,
      p_attended: p.attended,
    };
  if (operation === "meal_access")
    args = {
      p_id: p.id,
      p_version: p.version,
      p_locked: p.locked,
      p_cutoff: p.cutoff,
      p_reason: p.reason,
    };
  if (operation === "allocation")
    args = {
      p_catering: p.catering_id,
      p_payment: p.payment_id,
      p_amount: p.amount,
      p_version: p.version,
    };
  const { error } = await supabase.rpc(names[operation], args);
  if (error)
    return {
      ok: false,
      error: ["P0001", "42501"].includes(error.code)
        ? error.message
        : error.code === "23505"
          ? "This flat or participant already has a row here. Edit the existing row."
          : "Check counts, dates and required fields. Attended counts cannot exceed confirmed diners; clear check-in before cancelling.",
    };
  revalidatePath("/desk", "layout");
  revalidatePath("/admin/festivals", "layout");
  refresh();
  return { ok: true };
}
