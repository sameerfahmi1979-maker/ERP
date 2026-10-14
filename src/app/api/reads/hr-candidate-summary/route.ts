import {readCandidateSummary} from "@/server/reads/hr-recruitment-summary";
import {readRoute} from "@/server/reads/route-response";
export async function POST(request: Request) {return readRoute(request, readCandidateSummary);}
