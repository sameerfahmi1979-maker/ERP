import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";
import type { CommunicationCommand } from "./contracts";
import type { CommunicationActor } from "./access";
import { admitOperation, CommunicationHttpError, rpcFailure, userRpc } from "./http";
import { pushConfigured } from "./notifications-provider";

const mutation = { clientMutationId: z.uuid() };
const event = { eventId: z.uuid() };
const categories = ["groups","direct","mentions","erp","intake","leaveStart","timesheet","ptt","sos","budget","moderation","textPreview","label","vibrate","sound","offline"] as const;
const listFields=z.strictObject({filter:z.enum(["all","messages","erp"]).optional(),cursor:z.string().regex(/^[1-9][0-9]{0,18}$/).optional(),limit:z.number().int().min(1).max(80).optional()});
const commands = {
  "notifications.controlInbox": z.strictObject({cursor:z.string().regex(/^[1-9][0-9]{0,18}$/).optional()}),
  "notifications.controlResolve": z.strictObject(event),
  "notifications.controlMarkRead": z.strictObject({...event,...mutation}),
  "notifications.status": z.strictObject({}),
  "notifications.list":listFields,
  "notifications.webList":listFields,
  "notifications.webResolve":z.strictObject(event),
  "notifications.webMarkRead":z.strictObject({...event,...mutation}),
  "notifications.preview": z.strictObject({ ...event, installation:z.uuid() }),
  "notifications.resolve": z.strictObject(event),
  "notifications.reply": z.strictObject({...event,...mutation,body:z.string().trim().min(1).max(4096)}),
  "notifications.markRead": z.strictObject({...event,...mutation}),
  "notifications.preferences": z.strictObject({}),
  "notifications.setPreferences": z.strictObject({...mutation,settings:z.partialRecord(z.enum(categories),z.boolean())}),
  "notifications.registerDevice": z.strictObject({...mutation,installation:z.uuid(),token:z.string().min(32).max(4096).regex(/^[\w:.%-]+$/)}),
  "notifications.unregisterDevice": z.strictObject({...mutation,installation:z.uuid()}),
};
export async function dispatchNotifications(command: CommunicationCommand, actor: CommunicationActor, native=false) {
  if (!Object.hasOwn(commands,command.op)) throw new CommunicationHttpError("invalid_request");
  const fields = commands[command.op as keyof typeof commands].safeParse(command.args);
  if (!fields.success) throw new CommunicationHttpError("invalid_request");
  if (command.op === "notifications.status") return {pushConfigured:pushConfigured(), requiresDevicePermission:true};
  if (command.op.startsWith("notifications.control")) {
    const args=fields.data as {eventId?:string;cursor?:string};
    const op=command.op==="notifications.controlInbox"?"list":command.op==="notifications.controlResolve"?"resolve":"markRead";
    const {data,error}=await createAdminClient().rpc("erp_notification_control_read",{p_kind:op,p_native:native,p_event:args.eventId??null,p_cursor:args.cursor??null,
      p_profile:actor.profileId,p_session:actor.authSessionId,p_request:randomUUID()});
    if(error) rpcFailure(error);
    return data;
  }
  const registering = command.op === "notifications.registerDevice";
  if (registering && !pushConfigured()) throw new CommunicationHttpError("temporarily_unavailable");
  const webOps:Record<string,string>={"notifications.list":"notifications.webList","notifications.resolve":"notifications.webResolve","notifications.markRead":"notifications.webMarkRead"};
  const request = {op:(!native && webOps[command.op]) || command.op,args:fields.data};
  const permit = await admitOperation(actor,registering ? "push" : "chat",undefined,false,request);
  return userRpc("erp_notification_center",{p_request:request,p_permit:permit.permitId});
}
