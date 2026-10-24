import "server-only";
import {createHash} from "node:crypto";
import {z} from "zod";
import type {createClient} from "@/lib/supabase/server";
import {collectCompletePages} from "@/lib/reads/complete-pages";
import {payrollToday, salaryAsOf, salaryDate, SalaryUnavailable} from "@/lib/hr/payroll/salary-as-of";

const id = z.number().int().positive().refine(Number.isSafeInteger);
const revision=z.union([id,z.string().regex(/^[1-9]\d{0,18}$/).refine(v=>BigInt(v)<=BigInt('9223372036854775807'))]).transform(String);
const componentSchema = z.object({id, employee_id: id, workspace_revision:revision, component_type_id: id, amount: z.union([z.number().finite(), z.string()]).nullable(), effective_from: z.string(), effective_to: z.string().nullable(), is_active: z.boolean(), deleted_at: z.string().nullable(), component_type: z.object({component_kind: z.string(), is_basic: z.boolean(),workspace_revision:revision}).nullable()});
const profileSchema = z.object({employee_id: id,workspace_revision:revision, effective_date: z.string(), currency: z.string(), payroll_status: z.string()});
const effectSchema = z.object({id, revision_id: id, employee_id: id, effective_date: z.string(), new_basic: z.union([z.number().finite(), z.string()]), currency: z.string()});

/** Caller must supply its existing authorized/RLS or scoped-report client.
 * No admin-client construction, session fallback or role widening lives here.
 * Complete pages are count/identity checked. Two bounded passes reconcile every
 * monotonic profile/component/type version and the immutable applied timeline.
 * A changing source fails closed; this is not an approval or payment receipt.
 */
export async function readSalarySnapshot(db: Pick<Awaited<ReturnType<typeof createClient>>, "from">, employeeId: number, asOf = payrollToday()) {
  id.parse(employeeId); salaryDate(asOf);
  const collect=async()=>{
   const [profileResult, rows, effectRows] = await Promise.all([
    db.from("employee_payroll_profiles").select("employee_id,workspace_revision,effective_date,currency,payroll_status").eq("employee_id", employeeId).is("deleted_at", null).maybeSingle(),
    collectCompletePages((from, to) => db.from("employee_salary_components").select("id,employee_id,workspace_revision,component_type_id,amount,effective_from,effective_to,is_active,deleted_at,component_type:hr_salary_component_types!employee_salary_components_component_type_id_fkey(component_kind,is_basic,workspace_revision)", {count: "exact"}).eq("employee_id", employeeId).is("deleted_at", null).order("id").range(from, to), {identity: r => r.id}),
    collectCompletePages((from, to) => db.from("employee_salary_revision_effects").select("id,revision_id,employee_id,effective_date,new_basic,currency", {count: "exact"}).eq("employee_id", employeeId).order("id").range(from, to), {identity: r => r.id}),
  ]);
  if (profileResult.error) throw new SalaryUnavailable("Salary profile unavailable");
  const profile = profileSchema.safeParse(profileResult.data);
  if (!profile.success || profile.data.employee_id !== employeeId) throw new SalaryUnavailable("Salary profile not configured");
  if (salaryDate(profile.data.effective_date) > asOf) throw new SalaryUnavailable("Historical salary currency needs review");
  const components = z.array(componentSchema).parse(rows);
  const effects = z.array(effectSchema).parse(effectRows);
  if (components.some(row => row.employee_id !== employeeId)) throw new SalaryUnavailable("Salary subject mismatch");
  if (effects.some(row => row.employee_id !== employeeId)) throw new SalaryUnavailable("Salary effect subject mismatch");
   return{profile:profile.data,components,effects};
  };
  const first=await collect(),confirmed=await collect();
  const source=JSON.stringify(first);
  if(source!==JSON.stringify(confirmed))throw new SalaryUnavailable("Salary source changed during collection; retry the original request");
  return {...salaryAsOf(confirmed.components, asOf, confirmed.profile.currency, confirmed.effects), payrollStatus: confirmed.profile.payroll_status,sourceFingerprint:createHash('sha256').update(source).digest('hex')};
}
