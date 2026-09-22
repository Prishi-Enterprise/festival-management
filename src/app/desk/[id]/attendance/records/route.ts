import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { attendanceQuerySchema } from "@/lib/attendance-data";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const started = performance.now();
  const { id } = await context.params;
  const query = attendanceQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  const headers = { "Cache-Control": "private, no-store" };
  if (!z.uuid().safeParse(id).success || !query.success)
    return Response.json(
      { error: "Invalid attendance search." },
      { status: 400, headers },
    );
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return Response.json(
      { error: "Please sign in again." },
      { status: 401, headers },
    );
  // The RPC checks festival assignment and the selected society for every request.
  const dbStarted = performance.now();
  const { data, error } = await supabase.rpc("attendance_data", {
    p_festival: id,
    p_query: query.data,
  });
  if (error)
    return Response.json(
      { error: "Could not load attendance. Check access and try again." },
      { status: error.code === "42501" ? 403 : 500, headers },
    );
  return Response.json(data, {
    headers: {
      ...headers,
      "Server-Timing": `auth;dur=${(dbStarted - started).toFixed(1)}, db;dur=${(performance.now() - dbStarted).toFixed(1)}`,
    },
  });
}
