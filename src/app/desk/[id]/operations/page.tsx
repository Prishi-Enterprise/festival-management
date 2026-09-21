import { notFound } from "next/navigation";
import { z } from "zod";
import { requireMember } from "@/lib/auth";
import { OperationsDesk } from "@/components/operations-desk";
import type { OperationsData } from "@/lib/operations";
export default async function OperationsPage({
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
  if (error) {
    if (error.code === "42501") notFound();
    throw new Error("Could not load festival operations.");
  }
  return <OperationsDesk data={data as OperationsData} member={member} />;
}
