"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fleetId } from "@/lib/fleet/asset-contract";
import { allowancePayrollCandidates, allowancePayrollOrders, allowanceRateCommand, directionalRates,
  tripAllowanceCommand, tripAllowanceOrder } from "@/lib/fleet/allowance-contract";
import { canUseApplication, getAuthContext } from "@/lib/rbac/check";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

async function read<T>(rpc:string, args:Record<string,unknown>, contract:z.ZodType<T>) {
  try {
    if (!canUseApplication(await getAuthContext())) return null;
    const {data,error}=await (await createClient()).rpc(rpc,args,{get:true});
    if (error) {
      logger.warn("Trip allowance read unavailable",{rpc,code:error.code});
      return null;
    }
    const parsed=contract.safeParse(data);
    return parsed.success?parsed.data:null;
  } catch { return null; }
}

const paging = fleetId.optional();
export async function readAllowanceOrder(order:number) {
  if (!fleetId.safeParse(order).success) return null;
  return read("t09_trip_allowance_order",{p_order:order},tripAllowanceOrder);
}
export async function readAllowanceRateCatalogue(company:number,before?:number) {
  if (!fleetId.safeParse(company).success||!paging.safeParse(before).success) return null;
  return read("t09_allowance_rates",{p_company:company,p_before:before},directionalRates);
}
export async function readAllowancePayrollOrders(company:number,day:string,before?:number) {
  if (!fleetId.safeParse(company).success||!z.iso.date().safeParse(day).success||!paging.safeParse(before).success) return null;
  return read("t09_payroll_orders",{p_company:company,p_day:day,p_before:before},allowancePayrollOrders);
}
export async function readTripAllowanceCandidates(company:number,cutoff:string,before?:number) {
  if (!fleetId.safeParse(company).success||!z.iso.datetime({offset:true}).safeParse(cutoff).success||!paging.safeParse(before).success) return null;
  return read("t09_payroll_candidates",{p_employer:company,p_cutoff:cutoff,p_before:before},allowancePayrollCandidates);
}

async function save(rpc:string,args:Record<string,unknown>,path:string) {
  try {
    if (!canUseApplication(await getAuthContext())) return {error:"An active ERP session is required.",uncertain:false};
    const {data,error}=await (await createClient()).rpc(rpc,args);
    if (error?.code==="42501") return {error:"Current scope and an independent decision are required.",uncertain:false};
    if (error?.code==="PT409") return {error:error.message,uncertain:false};
    if (error?.code==="P0409"||error?.code.startsWith("22")||error?.code.startsWith("23")) {
      return {error:"Check the current source, rate and original request.",uncertain:false};
    }
    const receipt=z.object({id:fleetId,replayed:z.boolean()}).safeParse(data);
    if (error||!receipt.success) return {error:"Outcome unconfirmed. Retry the original request.",uncertain:true};
    try { revalidatePath(path); } catch { /* The database receipt is authoritative. */ }
    return {id:receipt.data.id};
  } catch { return {error:"Outcome unconfirmed. Retry the original request.",uncertain:true}; }
}
export async function saveTripAllowance(input:unknown) {
  const parsed=tripAllowanceCommand.safeParse(input);
  if (!parsed.success) return {error:"Complete the exact witness or allowance review fields.",uncertain:false};
  const cmd=parsed.data;
  return save("t09_trip_allowance",{p_operation:cmd.operation,p_actual:cmd.actual,p_action:cmd.action,p_data:cmd.data},"/modules/fleet/allowances");
}
export async function saveTripAllowanceRate(input:unknown) {
  const parsed=allowanceRateCommand.safeParse(input);
  if (!parsed.success) return {error:"Complete the direction, truck type, dates and approved amount.",uncertain:false};
  const cmd=parsed.data;
  return save("t09_save_allowance_rate",{p_operation:cmd.operation,p_company:cmd.company,p_action:cmd.action,p_data:cmd.data},"/modules/fleet/allowance-rates");
}
