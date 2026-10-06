import { readLookupValues } from "@/server/reads/lookup-values";
import { readRoute } from "@/server/reads/route-response";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { return readRoute(request, readLookupValues); }
