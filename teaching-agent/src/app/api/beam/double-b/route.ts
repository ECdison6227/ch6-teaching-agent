import { beamProxy } from "@/lib/beam-service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = (req: Request) => beamProxy(req, "double-b");
