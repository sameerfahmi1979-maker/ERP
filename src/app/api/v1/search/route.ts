import {readRoute} from "@/server/reads/route-response";
import {searchErp} from "@/server/ai/search/service";
/** Versioned shared document capability; unknown module names never become SQL. */
export async function POST(request:Request){return readRoute(request,input=>searchErp(input,request.signal));}
