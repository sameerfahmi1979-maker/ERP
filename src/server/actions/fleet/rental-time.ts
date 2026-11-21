"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fleetId } from "@/lib/fleet/asset-contract";
import { fleetAttendanceCommand, fleetAttendanceDrafts, fleetPayrollCandidates, fleetPayrollCommand, fleetPayrollQueue, fleetReceivingOrders,
  fleetTimeCommand, fleetTimeDate, fleetTimeInstant, fleetTimeOrder } from "@/lib/fleet/time-contract";
import { getAuthContext, canUseApplication } from "@/lib/rbac/check";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

async function read<T>(name: string, args: Record<string, unknown>, contract: z.ZodType<T>) {
  try {
    if (!canUseApplication(await getAuthContext())) return null;
    const { data, error } = await (await createClient()).rpc(name, args, { get: true });
    const parsed = contract.safeParse(data);
    if (error || (!parsed.success && data !== null)) {
      logger.warn("Fleet time read unavailable", { rpc: name, code: error?.code,
        fields: parsed.success ? undefined : parsed.error.issues.map(issue => issue.path.join(".")) });
    }
    return !error && parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function readFleetOrderTime(order: number, before?: number) {
  if (!fleetId.safeParse(order).success || !fleetId.optional().safeParse(before).success) return null;
  return read("t08_fleet_order_time", { p_order: order, p_before: before }, fleetTimeOrder);
}

export async function readFleetReceivingOrders(before?: number) {
  if (!fleetId.optional().safeParse(before).success) return null;
  return read("t08_receiving_orders", { p_before:before }, fleetReceivingOrders);
}

export async function readFleetAttendanceDrafts(day: string, after?: number) {
  if (!fleetTimeDate.safeParse(day).success || !fleetId.optional().safeParse(after).success) return null;
  return read("t08_attendance_drafts", { p_day: day, p_after: after }, fleetAttendanceDrafts);
}

export async function readFleetPayrollQueue(company: number, day: string, before?: number) {
  if (!fleetId.safeParse(company).success || !fleetTimeDate.safeParse(day).success || !fleetId.optional().safeParse(before).success) return null;
  return read("t08_payroll_queue", { p_company: company, p_day: day, p_before: before }, fleetPayrollQueue);
}

export async function readFleetPayrollCandidates(employer: number, cutoff: string, before?: number) {
  if (!fleetId.safeParse(employer).success || !fleetTimeInstant.safeParse(cutoff).success || !fleetId.optional().safeParse(before).success) return null;
  return read("t08_fleet_payroll_candidates", { p_employer: employer, p_cutoff: cutoff, p_before: before }, fleetPayrollCandidates);
}

async function save(name: string, args: Record<string, unknown>, path: string) {
  try {
    if (!canUseApplication(await getAuthContext())) return { error: "An active ERP session is required.", uncertain: false };
    const { data, error } = await (await createClient()).rpc(name, args);
    if (error?.code === "42501") return { error: "This action requires a current grant and an independent reviewer.", uncertain: false };
    if (error && ["PT409", "P0409"].includes(error.code)) {
      return { error: error.code === "PT409" ? error.message : "This request changed. Refresh and review it again.", uncertain: false };
    }
    if (error?.code === "23P01") return { error: "Some of this work overlaps an existing interval.", uncertain: false };
    if (error?.code.startsWith("22") || error?.code.startsWith("23")) {
      return { error: "Check the selected assignment, dates and required facts.", uncertain: false };
    }
    const receipt = z.object({ id: fleetId, replayed: z.boolean() }).safeParse(data);
    if (error || !receipt.success) return { error: "Outcome unconfirmed. Retry the original request.", uncertain: true };
    try { revalidatePath(path); } catch { /* The database receipt is authoritative. */ }
    return { id: receipt.data.id };
  } catch {
    return { error: "Outcome unconfirmed. Retry the original request.", uncertain: true };
  }
}

export async function saveFleetTime(input: unknown) {
  const parsed = fleetTimeCommand.safeParse(input);
  if (!parsed.success) return { error: "Complete the Fleet time fields.", uncertain: false };
  const cmd = parsed.data;
  return save("t08_fleet_time", { p_operation: cmd.operation, p_order: cmd.order, p_action: cmd.action, p_data: cmd.data }, "/modules/fleet/time");
}

export async function reviewFleetAttendance(input: unknown) {
  const parsed = fleetAttendanceCommand.safeParse(input);
  if (!parsed.success) return { error: "Choose the reviewed attendance entry and provide a reason.", uncertain: false };
  const cmd = parsed.data;
  return save("t08_review_attendance", { p_operation: cmd.operation, p_employee: cmd.employee, p_day: cmd.day, p_mode: cmd.mode,
    p_token: cmd.token, p_reason: cmd.reason }, "/admin/hr/time/attendance");
}

export async function acceptFleetOvertime(input: unknown) {
  const parsed = fleetPayrollCommand.safeParse(input);
  if (!parsed.success) return { error: "Confirm the overtime basis and provide a reason.", uncertain: false };
  const cmd = parsed.data;
  return save("t08_payroll_review", { p_operation: cmd.operation, p_work: cmd.work, p_digest: cmd.digest, p_reason: cmd.reason },
    "/admin/hr/payroll/fleet-time");
}
