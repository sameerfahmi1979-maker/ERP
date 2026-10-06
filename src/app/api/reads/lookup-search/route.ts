import { readRoute } from "@/server/reads/route-response";
import { readLookupSearch } from "@/server/reads/lookup-values";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { return readRoute(request, readLookupSearch); }
