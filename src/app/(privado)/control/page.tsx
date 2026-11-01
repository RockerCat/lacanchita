import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth";

export default async function ControlHome() {
  await requirePlatformAdmin();
  redirect("/control/torneos");
}
