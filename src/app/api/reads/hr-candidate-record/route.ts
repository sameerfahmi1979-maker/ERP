import {readCandidateRecord} from "@/server/reads/hr-candidate-record";
import {readRoute} from "@/server/reads/route-response";
export async function POST(request: Request) {return readRoute(request, readCandidateRecord);}
