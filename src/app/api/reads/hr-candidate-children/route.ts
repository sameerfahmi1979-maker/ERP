import {readCandidateChildren} from "@/server/reads/hr-candidate-children";
import {readRoute} from "@/server/reads/route-response";

export async function POST(request: Request) {
  return readRoute(request, readCandidateChildren);
}
