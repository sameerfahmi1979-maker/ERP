import { z } from "zod";
import { fleetId as id } from "@/lib/fleet/asset-contract";

const text = z.string();
const nullable = text.nullable();
const day = z.iso.date();
const time = z.iso.datetime({offset:true});
const digest = text.regex(/^[0-9a-f]{64}$/);
const money = text.regex(/^-?\d+\.\d{2}$/);
const choice = z.object({id,label:text});
export const witnessKind = z.enum(["customer-confirmation","destination-weighbridge","site-receipt"]);
const proofRef = z.object({document:id,version:id,file:id,reference:text});
const witnessFacts = z.object({trip:text,sequence:id,asset:text,origin:id,destination:id,delivered:time,issuer:id.nullable().optional()});
const exception = z.object({
  id,state:z.enum(["pending","approved","rejected"]),kind:witnessKind,reason:text,decision_reason:nullable,can_decide:z.boolean(),
  document:id.nullable(),version:id.nullable(),file:id.nullable(),observed:witnessFacts.nullable(),
});
export const tripAllowanceOrder = z.object({
  id,number:text,subject:text,customer:id.nullable(),customer_label:nullable,can_submit:z.boolean(),can_approve:z.boolean(),can_payroll:z.boolean(),
  legs:z.array(z.object({
    id,sequence:id,date:day,arrival:time,origin:text,destination:text,origin_id:id,destination_id:id,
    asset:text,worker:text,truck:nullable,load:z.enum(["empty","loaded"]),state:text,
    has_signed_pod:z.boolean(),proof_available:z.boolean(),proof:proofRef.nullable(),
    route_digest:digest.nullable(),digest:digest.nullable(),amount:money.nullable(),currency:nullable,
    assigned_rate:id.nullable(),current_rate:id.nullable(),rate_needs_review:z.boolean(),
    can_decide:z.boolean(),can_accept:z.boolean(),settled:z.boolean(),
    sources:z.array(z.object({document:id,version:id,file:id,type:text,label:text})),
    exceptions:z.array(exception),changes:z.array(z.object({
      id,mode:z.enum(["void","reprice"]),reason:text,decided:z.boolean(),can_accept:z.boolean(),amount:money.nullable(),currency:nullable,
      outcome:z.enum(["accepted","rejected","withdrawn"]).nullable(),withdraw_version:id.nullable(),
    })),
  })),
});
export const directionalRates = z.object({
  can_prepare:z.boolean(),can_approve:z.boolean(),sites:z.array(choice),currencies:z.array(text),truck_types:z.array(text),
  rates:z.array(z.object({
    id,origin:text,destination:text,truck:text,from:day,until:day.nullable(),amount:money,currency:text,
    approved:z.boolean(),can_decide:z.boolean(),reason:text,
  })).max(26),
});
export const allowancePayrollOrders = z.array(z.object({id,number:text,subject:text})).max(26);
export const allowancePayrollCandidates = z.array(z.object({
  id,actual:id,employee:id,employer:id,employment:id,date:day,kind:z.enum(["base","adjustment"]),amount:money,
  currency:text,basis:z.record(text,z.unknown()),prior:id.nullable(),available:time,
})).max(26);
const reason = text.trim().min(1).max(500);
const rateDetails = z.object({
  origin:id,destination:id,truck_type:text.trim().min(1).max(120),from:day,until:day.optional(),
  amount:text.regex(/^\d{1,12}(?:\.\d{1,2})?$/),currency:text.regex(/^[A-Z]{3}$/),reason,
}).strict();
export const allowanceRateCommand = z.discriminatedUnion("action",[
  z.object({operation:z.uuid(),company:id,action:z.literal("prepare"),data:rateDetails}).strict(),
  z.object({operation:z.uuid(),company:id,action:z.literal("approve"),data:z.object({id,reason}).strict()}).strict(),
]);
const subject = {operation:z.uuid(),actual:id};
const decision = z.object({id,reason}).strict();
export const tripAllowanceCommand = z.discriminatedUnion("action",[
  z.object({...subject,action:z.literal("submit-exception"),data:z.object({
    kind:witnessKind,evidence:proofRef.extend({reference:text.trim().min(1).max(100)}).strict(),
    observed:witnessFacts.extend({trip:text.trim().min(1).max(100),asset:text.trim().min(1).max(100),sequence:z.number().int().min(1).max(50)}).strict(),
    reason,
  }).strict()}).strict(),
  z.object({...subject,action:z.enum(["approve-exception","reject-exception","accept-adjustment","reject-adjustment","withdraw-adjustment"]),data:decision}).strict(),
  z.object({...subject,action:z.enum(["review-rate","accept"]),data:z.object({digest,reason}).strict()}).strict(),
  z.object({...subject,action:z.literal("propose-adjustment"),data:z.object({mode:z.enum(["void","reprice"]),reason}).strict()}).strict(),
]);
export type AllowanceOrder = z.infer<typeof tripAllowanceOrder>;
export type DirectionalRates = z.infer<typeof directionalRates>;
