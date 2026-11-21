import { z } from "zod";
import { fleetId } from "@/lib/fleet/asset-contract";

const text = z.string();
const nullableText = text.nullable();
const time = z.iso.datetime({ offset: true });
const date = z.iso.date();
const choice = z.object({ id: fleetId, label: text });
export const operationKind = z.enum(["trip","rental"]);
const status = z.enum(["requested","authorized","active","review","completed","cancelled"]);
export const nextActions = {
  "review-authorization":"Review request",completed:"Completed",cancelled:"Cancelled",
  "resolve-hold":"Resolve active Fleet hold","complete-missing-evidence":"Review missing or disputed evidence",
  "plan-resource":"Plan an asset and worker","record-activity":"Record actual activity",
  "issue-trip-order":"Issue Trip Order","confirm-handover":"Confirm handover","review-completion":"Review completion",
} as const;
const next = z.enum(Object.keys(nextActions) as (keyof typeof nextActions)[]);
export const operationChoices = z.object({
  scopes:z.array(choice.omit({id:true}).extend({company:fleetId,branch:fleetId})),
  sites:z.array(choice),parties:z.array(choice),assets:z.array(choice),workers:z.array(choice),
});
export type OperationChoices = z.infer<typeof operationChoices>;
export const operationRow = z.object({
  id:fleetId,number:text,subject:text,kind:operationKind,status,reference:text,next_action:next,
});
export const operationList = z.array(operationRow).max(26);

export const operationDetail = operationRow.extend({
  revision:fleetId,company:fleetId,branch:fleetId,site:fleetId,
  authorization:nullableText,rental_mode:z.enum(["wet","dry"]).nullable(),customer:nullableText,supplier:nullableText,
  can_manage:z.boolean(),can_approve:z.boolean(),can_commercial:z.boolean(),can_approve_handover:z.boolean(),
  assignments:z.array(z.object({
    id:fleetId,slot:fleetId,state:z.enum(["planned","active","closed","replaced","cancelled"]),supersedes:fleetId.nullable(),
    asset_id:fleetId,asset:text,worker:text,worker_id:fleetId,employer:nullableText,
    from:time,until:time,handover:time.nullable(),return:time.nullable(),planned_return:time.nullable(),inspected:z.boolean().nullable(),
    handover_approved:z.boolean(),
  })),
  legs:z.array(z.object({
    id:fleetId,sequence:fleetId,origin:text,destination:text,origin_id:fleetId,destination_id:fleetId,
    load:z.enum(["loaded","empty"]),cargo:nullableText,actual_origin:nullableText,actual_destination:nullableText,
    pickup_contact:nullableText,pickup_phone:nullableText,delivery_contact:nullableText,delivery_phone:nullableText,instructions:nullableText,
    departed:time.nullable(),arrived:time.nullable(),actual_load:nullableText,net_kg:z.number().nullable(),delivery:nullableText,discrepancy:nullableText,
    pod_current:z.boolean(),
  })),
  papers:z.array(choice.extend({issued:time,ready:z.boolean(),can_finalize:z.boolean()})),
  rental_events:z.array(z.object({id:fleetId,kind:text,at:time,assignment:fleetId.nullable(),reason:text})),
  usage:z.array(z.object({id:fleetId,assignment:fleetId,from:time,until:time,state:z.enum(["signed","disputed","missing"]),reason:nullableText,
    evidence_current:z.boolean(),document:fleetId.nullable()})),
  terms:z.array(z.object({
    id:fleetId,quote:text,lpo:text,unit:text,rate:z.number(),ceiling:z.number(),currency:text,from:date,until:date,approved:z.boolean(),
    document:fleetId.nullable(),version:fleetId.nullable(),file:fleetId.nullable(),
  })),
  statements:z.array(z.object({id:fleetId,terms:fleetId,quantity:z.number(),amount:z.number(),approved:z.boolean(),supersedes:fleetId.nullable(),
    usage:z.array(z.object({id:fleetId,document:fleetId.nullable(),version:fleetId.nullable(),file:fleetId.nullable(),reference:nullableText})),
  })),
  currencies:z.array(choice),
  proofs:z.array(z.object({document:fleetId,version:fleetId,file:fleetId,asset:fleetId,type:text,label:text})),
  history:z.array(z.object({id:fleetId,action:text,at:time,reason:text})),
});
export type OperationDetail = z.infer<typeof operationDetail>;
export const tripOrder = z.object({
  issue:text,issued:time,ready:z.boolean(),can_finalize:z.boolean(),snapshot:z.object({
    order_no:text,subject:text,reference:text,authorization:text,employer:text,employer_ar:nullableText.optional(),branch:text,customer:nullableText,
    assignments:z.array(z.object({id:fleetId,asset_no:text,asset_name:text,worker:text,from:time,until:time,site:text})),
    legs:z.array(z.object({
      sequence:fleetId,origin:text,destination:text,load:text,cargo:nullableText,
      pickup_address:nullableText.optional(),delivery_address:nullableText.optional(),
      pickup_contact:nullableText,pickup_phone:nullableText,delivery_contact:nullableText,delivery_phone:nullableText,instructions:nullableText,
    })),
  }),
});
export type TripOrder = z.infer<typeof tripOrder>;
export const tripOrderPdf = z.object({issue:text,pdf:text,sha256:z.string().regex(/^[a-f0-9]{64}$/)});
export const operationsActions = [
  "create","authorize","plan-leg","assign","substitute","inspect","issue-paper","start","complete-leg","resolve-pod","return",
  "cancel-assignment","complete","cancel","reopen","record-sheet","resolve-sheet","approve-handover","rental-event","extend-rental",
  "prepare-terms","approve-terms","prepare-statement","approve-statement",
] as const;
export const commercialActions = new Set<string>(["prepare-terms","approve-terms","prepare-statement","approve-statement"]);
export const operationCommand = z.object({
  operation:z.uuid(),order:fleetId.nullable(),action:z.enum(operationsActions),data:z.record(z.string(),z.unknown()),
}).strict();
export type OperationCommand = z.infer<typeof operationCommand>;
export const operationReceipt = z.object({id:fleetId,order_no:text,status,revision:fleetId,event_id:fleetId.nullable(),replayed:z.boolean()}).strict();
