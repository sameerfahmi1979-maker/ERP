import {readHrDisciplinaryInquiryDetail} from "@/server/reads/hr-action-inquiries";
import {readRoute} from "@/server/reads/route-response";
export async function POST(request: Request) {return readRoute(request, readHrDisciplinaryInquiryDetail);}
