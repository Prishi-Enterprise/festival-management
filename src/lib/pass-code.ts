import { z } from "zod";
export function parsePassCode(
  value: string,
  origin: string,
): { kind: "resident" | "guest"; code: string } | null {
  try {
    const url = new URL(value.trim());
    if (url.origin !== origin || url.username || url.password) return null;
    const match = url.pathname.match(
      /^\/(resident-pass|guest-pass)\/([^/]+)\/?$/,
    );
    if (!match || !z.uuid().safeParse(match[2]).success) return null;
    return {
      kind: match[1] === "resident-pass" ? "resident" : "guest",
      code: match[2],
    };
  } catch {
    return null;
  }
}
