import { redirect } from "next/navigation";
/** Preserve the direct URL while using the same workspace and navigation. */
// Next.js adds its configured basePath to server redirects.
export default function Page() { redirect("/#self-test"); }
