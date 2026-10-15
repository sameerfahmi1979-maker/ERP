import {readHrOperations} from "@/server/reads/hr-operations";
import {readRoute} from "@/server/reads/route-response";
export async function POST(request: Request) {return readRoute(request, readHrOperations);}
