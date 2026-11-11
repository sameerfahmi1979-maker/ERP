import {readHrDashboard} from "@/server/reads/hr-dashboard";
import {readRoute} from "@/server/reads/route-response";
import {readHrDashboardWorkspace} from "@/server/reads/hr-dashboard-workspace";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {return readRoute(request, input =>
  input && typeof input === 'object' && 'mode' in input
    ? readHrDashboardWorkspace(input, undefined, request.signal)
    : readHrDashboard(input));}
