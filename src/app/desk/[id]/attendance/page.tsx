import { appUrl } from "@/lib/config";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireMember } from "@/lib/auth";
import { AttendanceDesk } from "@/components/attendance-desk";
import {
  attendanceQuerySchema,
  type AttendanceData,
} from "@/lib/attendance-data";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const query = attendanceQuerySchema.safeParse(await searchParams);
  const { supabase, member } = await requireMember();
  const { data, error } = await supabase.rpc("attendance_data", {
    p_festival: id,
    p_query: query.success ? query.data : {},
  });
  if (error) throw new Error("Could not load attendance.");
  return (
    <>
      <AttendanceDesk
        data={data as AttendanceData}
        member={member}
        baseUrl={appUrl()}
      />
    </>
  );
}
