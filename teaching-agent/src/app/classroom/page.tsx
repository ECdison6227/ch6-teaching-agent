import { redirect } from "next/navigation";
import { appPath } from "@/lib/app-path";
/** Preserve the direct URL while using the same workspace and navigation. */
export default function Page() { redirect(appPath("/#classroom")); }
