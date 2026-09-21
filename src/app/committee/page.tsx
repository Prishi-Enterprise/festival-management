import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth";
export default async function Committee() {
  await requireMember();
  redirect("/desk");
}
