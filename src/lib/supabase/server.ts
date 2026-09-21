import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicConfig } from "@/lib/config";
export async function createClient(societyId?: string) {
  const config = publicConfig();
  const jar = await cookies();
  const society = societyId ?? jar.get("festival-society")?.value;
  return createServerClient(config.url, config.key, {
    global: { headers: society ? { "x-society-id": society } : {} },
    cookies: {
      getAll: () => jar.getAll(),
      setAll(values) {
        try {
          values.forEach(({ name, value, options }) =>
            jar.set(name, value, options),
          );
        } catch {
          /* Server Components are read-only; proxy handles refresh. */
        }
      },
    },
  });
}
