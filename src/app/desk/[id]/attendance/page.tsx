import { RsvpContacts } from "@/components/rsvp-contacts";
import { appUrl } from "@/lib/config";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireMember } from "@/lib/auth";
import { AttendanceDesk } from "@/components/attendance-desk";
import type { OperationsData } from "@/lib/operations";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { supabase, member } = await requireMember();
  const { data, error } = await supabase.rpc("operations_data", {
    p_festival: id,
  });
  if (error) throw new Error("Could not load attendance.");
  return (
    <>
      <AttendanceDesk data={data as OperationsData} member={member} />
      <RsvpContacts
        data={data as OperationsData}
        admin={member.role === "admin"}
        baseUrl={appUrl()}
      />
    </>
  );
}
