import {readHrDashboard} from "@/server/reads/hr-dashboard";
import {readRoute} from "@/server/reads/route-response";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {return readRoute(request, input => readHrDashboard(input));}
