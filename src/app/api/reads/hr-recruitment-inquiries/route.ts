import {readRecruitmentInquiry} from "@/server/reads/hr-recruitment-inquiries";
import {readRoute} from "@/server/reads/route-response";
export async function POST(request: Request) {return readRoute(request, readRecruitmentInquiry);}
