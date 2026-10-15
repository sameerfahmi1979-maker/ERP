import { readDmsExpiryOutput } from "@/server/reads/dms-expiry-page";
import { readRoute } from "@/server/reads/route-response";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { return readRoute(request, readDmsExpiryOutput); }
