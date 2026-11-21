"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fleetId } from "@/lib/fleet/asset-contract";
import {
  commercialActions, operationChoices, operationCommand, operationDetail, operationKind, operationList, operationReceipt, tripOrder, tripOrderPdf,
} from "@/lib/fleet/operations-contract";
import { logger } from "@/lib/logger";
import { getAuthContext } from "@/lib/rbac/check";
import { canUseApplication } from "@/lib/rbac/scope";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderTripOrderPdf } from "@/server/fleet/trip-order-pdf";

async function readOperation<T>(rpc:string,args:Record<string,unknown>,schema:z.ZodType<T>) {
  if (!canUseApplication(await getAuthContext())) return null;
  const db=await createClient();
  const result=await db.rpc(rpc,args,{get:true});
  if (result.error) {
    logger.warn("Fleet operation read unavailable",{rpc,code:result.error.code});
    return null;
  }
  if (result.data===null) return null;
  const parsed=schema.safeParse(result.data);
  return parsed.success?parsed.data:null;
}

export async function listFleetOperations(query:string,kind?:string,before?:number) {
  if (query.length>160 || (kind!==undefined&&!operationKind.safeParse(kind).success)
    || (before!==undefined&&!fleetId.safeParse(before).success)) return null;
  return readOperation("t07_fleet_operations",{p_query:query,p_kind:kind,p_before:before},operationList);
}

export async function getOperationsChoices(company?:number,branch?:number,query="") {
  if (query.length>100 || (company!==undefined&&!fleetId.safeParse(company).success)
     || (branch!==undefined&&!fleetId.safeParse(branch).success)) return null;
  return readOperation("t07_fleet_operation_choices",{p_company:company,p_branch:branch,p_query:query},operationChoices);
}

export async function getFleetOperation(id:number) {
  return fleetId.safeParse(id).success?readOperation("t07_fleet_operation_detail",{p_order:id},operationDetail):null;
}

export async function getIssuedTripOrderPdf(order:number,issue:number) {
  if (!fleetId.safeParse(order).success||!fleetId.safeParse(issue).success) return null;
  return readOperation("t07_fleet_trip_order_pdf",{p_order:order,p_issue:issue},tripOrderPdf);
}

export async function finalizeTripOrder(order:number,issue:number) {
  if (!fleetId.safeParse(order).success||!fleetId.safeParse(issue).success) return false;
  const ctx=await getAuthContext();
  if (!canUseApplication(ctx)||!ctx.profile) return false;
  const paper=await readOperation("t07_fleet_trip_order",{p_order:order,p_issue:issue},tripOrder);
  if (!paper) return false;
  if (paper.ready) return true;
  if (!paper.can_finalize) return false;
  const db=await createClient();
  const {data}=await db.auth.getClaims();
  if (!data?.claims.sub||typeof data.claims.session_id!=="string") return false;
  const bytes=renderTripOrderPdf(paper);
  const published=await createAdminClient().rpc("t07_publish_trip_order",{
    p_order:order,p_issue:issue,p_claims:{sub:data.claims.sub,session_id:data.claims.session_id},p_pdf:bytes.toString("base64"),
  });
  if (published.error||published.data!==true) return false;
  revalidatePath(`/modules/fleet/operations/${order}`);
  return true;
}

export async function saveFleetOperation(input:unknown) {
  const parsed=operationCommand.safeParse(input);
  if (!parsed.success) return {error:"Check the required Fleet operation fields.",uncertain:false} as const;
  const cmd=parsed.data;
  try {
    if (!canUseApplication(await getAuthContext())) return {error:"An active ERP session is required.",uncertain:false} as const;
    const db=await createClient();
    const response=await db.rpc(commercialActions.has(cmd.action)?"t07_review_rental":"t07_fleet_operation",{
      p_operation:cmd.operation,p_order:cmd.order,p_action:cmd.action,p_data:cmd.data,
    });
    const code=response.error?.code??"";
    if (code==="42501") return {error:"This action is outside your current Fleet authority.",uncertain:false} as const;
    if (code==="23505") return {error:"This paper reference, reservation or signed usage is already recorded.",uncertain:false} as const;
    if (["PT409","P0409","23P01"].includes(code)) {
      return {error:"Review the current availability, operation status, approval or signed proof and try again.",uncertain:false} as const;
    }
    if (code.startsWith("22")||code.startsWith("23")) return {error:"Check the dates, selected records and required facts.",uncertain:false} as const;
    const saved=operationReceipt.safeParse(response.data);
    if (response.error||!saved.success||(cmd.order!==null&&saved.data.id!==cmd.order)) {
      return {error:"The result is unconfirmed. Retry the original request.",uncertain:true} as const;
    }
    if (cmd.action==="issue-paper"&&saved.data.event_id!==null&&!await finalizeTripOrder(saved.data.id,saved.data.event_id)) {
      return {error:"The Trip Order PDF is pending. Retry the original request.",uncertain:true} as const;
    }
    try {
      revalidatePath("/modules/fleet/operations");
      revalidatePath(`/modules/fleet/operations/${saved.data.id}`);
      revalidatePath("/modules/fleet");
    } catch { /* The transaction receipt is authoritative. */ }
    return {data:saved.data} as const;
  } catch {
    return {error:"The result is unconfirmed. Retry the original request.",uncertain:true} as const;
  }
}
