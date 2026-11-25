import "server-only";
import {dmsBusinessDate} from "@/lib/dms/expiry-calendar";
import {z} from "zod";
import {getAuthContext,hasPermission,type AuthContext} from "@/lib/rbac/check";
import {createClient} from "@/lib/supabase/server";
import {collectCompletePages} from "@/lib/reads/complete-pages";
import {dmsDashboardCriteriaSchema,dmsDashboardSchema,dmsDashboardInboxRow,type DmsDashboard,type DmsDashboardMetric,type DmsDashboardUnavailable} from "@/lib/reads/dms-dashboard-schema";
const id=z.number().int().positive().refine(Number.isSafeInteger),count=z.number().int().nonnegative().refine(Number.isSafeInteger);
type Native={data:unknown;count:number|null;error:unknown};
interface Query extends PromiseLike<Native>{
  is(k:string,v:null):Query;neq(k:string,v:string):Query;not(k:string,op:string,v:unknown):Query;in(k:string,v:readonly (string|number)[]):Query;
  gte(k:string,v:string):Query;lte(k:string,v:string):Query;lt(k:string,v:string):Query;
  order(k:string,v?:{ascending:boolean}):Query;range(a:number,b:number):Query;
}
export const DMS_DASHBOARD_AGGREGATE_LIMIT=5000;
export const DMS_DASHBOARD_TIMEOUT_MS=15000;
const MAX_REQUESTS=60,MAX_CONCURRENT=4;
class TooLarge extends Error{}
const ready=(value:number):DmsDashboardMetric=>({status:"ready",value:count.parse(value)});
/** Visible rows only; neither a capability flag nor this DTO claims coverage of
 * hidden companies. Every query retains the ordinary F03 client/RLS. Complete
 * traversal budgets are engineering limits, never business/count truncation.
 * Calendar-month boundaries are server-local, expiry uses Dubai business
 * dates, and the selected range is an exact rolling instant. */
export async function readDmsDashboard(input:unknown={},context?:AuthContext,callerSignal?:AbortSignal):Promise<{success:boolean;data?:DmsDashboard;error?:string}>{
  const parsed=dmsDashboardCriteriaSchema.safeParse(input);if(!parsed.success)return{success:false,error:"Invalid dashboard range"};
  const signal=AbortSignal.any([...(callerSignal?[callerSignal]:[]),AbortSignal.timeout(DMS_DASHBOARD_TIMEOUT_MS)]);
  try{
    signal.throwIfAborted();const ctx=context??await getAuthContext();signal.throwIfAborted();
    if(!["dms.documents.view","dms.admin"].some(p=>hasPermission(ctx,p)))return{success:false,error:"Permission denied"};
    const db=await createClient(),now=new Date(),asOf=now.toISOString(),today=dmsBusinessDate(now.getTime()),future=(n:number)=>dmsBusinessDate(now.getTime(), n);
    const month=new Date(now.getFullYear(),now.getMonth(),1).toISOString(),lastMonth=new Date(now.getFullYear(),now.getMonth()-1,1).toISOString(),rangeStart=new Date(now.getTime()-parsed.data.rangeDays*86400000).toISOString();
    let requests=0,active=0;const waiting:Array<()=>void>=[];
    const execute=async(q:PromiseLike<Native>)=>{
      signal.throwIfAborted();if(active>=MAX_CONCURRENT)await new Promise<void>(resolve=>waiting.push(resolve));else active++;
      try{signal.throwIfAborted();if(++requests>MAX_REQUESTS)throw new TooLarge();const result=await q;signal.throwIfAborted();if(result.error)throw Error("Dashboard source unavailable");return result;}
      finally{const next=waiting.shift();if(next)next();else active--;}
    };
    const select=(table:string,fields:string,head=false):Query=>db.from(table).select(fields,{count:"exact",head}).abortSignal(signal) as unknown as Query;
    const documents=(fields="id",head=false)=>select("dms_documents",fields,head).is("deleted_at",null);
    const expiry=(days:number,fields="id",head=false)=>documents(fields,head).not("expiry_date","is",null).gte("expiry_date",today).lte("expiry_date",future(days)).neq("status","superseded");
    const inbox=(fields="id",head=false)=>select("dms_upload_sessions",fields,head).in("status",["uploaded","processing"]).not("intake_status","eq","discarded").is("deleted_at",null);
    const safe=async<T>(allowed:boolean,fn:()=>Promise<T>):Promise<T|DmsDashboardUnavailable>=>{
      if(!allowed)return{status:"restricted"};try{return await fn();}catch(error){if(signal.aborted)throw error;return{status:error instanceof TooLarge?"too_large":"failed"};}
    };
    const exact=async(q:Query)=>count.parse((await execute(q)).count);
    const metric=(q:()=>Query,allowed=true)=>safe(allowed,async()=>ready(await exact(q())));
    const complete=async<S extends z.ZodType<{id:number}>>(query:()=>Query,schema:S)=>collectCompletePages(async(from,to)=>{
      const r=await execute(query().range(from,to));if(r.count!==null&&r.count>DMS_DASHBOARD_AGGREGATE_LIMIT)throw new TooLarge();
      return {...r,data:z.array(schema).parse(r.data)};
    },{identity:r=>r.id,maxRows:DMS_DASHBOARD_AGGREGATE_LIMIT,signal});
    const panel=async<S extends z.ZodType<{id:number}>>(q:Query,schema:S)=>{
      const r=await execute(q.range(0,4)),totalCount=count.parse(r.count),items=z.array(schema).parse(r.data);
      if(items.length!==Math.min(5,totalCount)||new Set(items.map(v=>v.id)).size!==items.length)throw Error("Incomplete panel");
      return{status:"ready" as const,items,totalCount,limited:totalCount>5};
    };
    const aiStages = [
      ["ocr_pending", "OCR Pending"],
      ["ocr_done", "OCR Done / AI Pending"],
      ["ai_complete", "AI Complete"],
      ["pending_review", "Pending Review"],
    ] as const;
    const bucketDays = [7, 14, 30, 60, 90] as const;
    // Keep the two charts independent. AI stages overlap, while the expiry
    // badge and the five-row attention panel retain their own exact reads.
    const ai = safe(true, async () => {
      const result = await execute(db.rpc("perf_dms_dashboard_ai_pipeline").abortSignal(signal));
      const counts = z.array(count).length(aiStages.length).parse(result.data);
      return {
        status: "ready" as const,
        items: aiStages.map(([status, label], index) => ({ status, label, count: counts[index] })),
      };
    });
    const buckets = safe(true, async () => {
      const result = await execute(db.rpc("perf_dms_dashboard_expiry_buckets", { p_today: today }).abortSignal(signal));
      const counts = z.array(count).length(bucketDays.length).parse(result.data);
      return {
        status: "ready" as const,
        items: bucketDays.map((days, index) => ({
          label: index ? `${bucketDays[index - 1] + 1}–${days}d` : "≤7d",
          days,
          count: counts[index],
        })),
      };
    });
    const inboxPanel=safe(true,()=>panel(inbox("id,original_filename,status,intake_status,created_at,session_code").order("created_at",{ascending:false}).order("id",{ascending:false}),dmsDashboardInboxRow.strip()));
    const canQueue=["dms.review_queue.view","dms.review_queue.manage","dms.documents.review_ai","dms.admin"].some(p=>hasPermission(ctx,p))||ctx.roleCodes.includes("system_admin");
    const canRenewals=["dms.renewals.view","dms.renewals.manage","dms.admin"].some(p=>hasPermission(ctx,p));
    const [total,added,prior,queue,expiring30,storage,byDay,byCategory,pipeline,expiryBuckets,pending,expiring,renewals]=await Promise.all([
      metric(()=>documents("id",true).neq("status","archived")),metric(()=>documents("id",true).gte("created_at",month)),metric(()=>documents("id",true).gte("created_at",lastMonth).lt("created_at",month)),
      metric(()=>select("dms_review_queue","id",true).is("deleted_at",null).in("status",["open","assigned","in_review"]),canQueue),
      // Preserve the original one-query exact 30-day count. Summing separately
      // observed buckets could drift under concurrent expiry changes.
      metric(()=>expiry(30,"id",true)),
      safe(true,async()=>ready((await complete(()=>select("dms_document_files","id,file_size_bytes").not("file_size_bytes","is",null).order("id",{ascending:true}),z.object({id,file_size_bytes:count}).strip())).reduce((sum,r)=>count.parse(sum+r.file_size_bytes),0))),
      safe(true,async()=>{const rows=await complete(()=>documents("id,created_at").gte("created_at",rangeStart).order("id",{ascending:true}),z.object({id,created_at:z.iso.datetime({offset:true})}).strip());const grouped=new Map<string,number>();for(const r of rows){const day=r.created_at.slice(0,10);grouped.set(day,(grouped.get(day)??0)+1);}return{status:"ready" as const,items:[...grouped].sort(([a],[b])=>a.localeCompare(b)).map(([date,count])=>({date,count}))};}),
      safe(true,async()=>{const rows=await complete(()=>documents("id,category:dms_document_categories!inner(name_en)").neq("status","archived").not("category_id","is",null).order("id",{ascending:true}),z.object({id,category:z.object({name_en:z.string().nullable()}).strip().nullable()}).strip());const grouped=new Map<string,number>();for(const r of rows){const name=r.category?.name_en??"Other";grouped.set(name,(grouped.get(name)??0)+1);}return{status:"ready" as const,items:[...grouped].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count||(a.name<b.name?-1:a.name>b.name?1:0)).slice(0,8)};}),
      ai,buckets,inboxPanel,
      safe(true,async()=>{const r=await panel(expiry(7,"id,document_no,title,expiry_date,document_type:dms_document_types(name_en)").order("expiry_date",{ascending:true}).order("id",{ascending:true}),z.object({id,document_no:z.string(),title:z.string(),expiry_date:z.iso.date(),document_type:z.object({name_en:z.string().nullable()}).strip().nullable()}).strip());return{...r,items:r.items.map(({document_type,...row})=>({...row,document_type_name:document_type?.name_en??null}))};}),
      safe(canRenewals,async()=>{
        const query = select("dms_renewal_requests", "id,document_id,renewal_no,status,priority,assigned_to")
          .is("deleted_at", null)
          .in("status", ["draft", "requested", "in_progress", "waiting_for_document"])
          .order("created_at", { ascending: false })
          .order("id", { ascending: false });
        const page = await panel(query, z.object({
          id,
          document_id: id,
          renewal_no: z.string().nullable(),
          status: z.string(),
          priority: z.string().nullable(),
          assigned_to: id.nullable(),
        }).strip());

        // The ordinary renewal policy admits the rows. Resolve only the page's
        // references under the same caller so hidden titles and names stay masked.
        const documentIds = [...new Set(page.items.map(row => row.document_id))];
        const assigneeIds = [...new Set(page.items.flatMap(row => row.assigned_to === null ? [] : [row.assigned_to]))];
        const readReferences = async <S extends z.ZodType<{ id: number }>>(query: () => Query, ids: number[], schema: S) => {
          if (!ids.length) return [];
          const { items } = await panel(query().in("id", ids).order("id", { ascending: true }), schema);
          if (items.some(row => !ids.includes(row.id))) throw Error("Unexpected renewal reference");
          return items;
        };
        const [documentRows, profileRows] = await Promise.all([
          readReferences(() => documents("id,title"), documentIds, z.object({ id, title: z.string() }).strip()),
          readReferences(() => select("user_profiles", "id,full_name"), assigneeIds, z.object({ id, full_name: z.string().nullable() }).strip()),
        ]);
        const documentTitles = new Map(documentRows.map(row => [row.id, row.title]));
        const profileNames = new Map(profileRows.map(row => [row.id, row.full_name]));
        return {
          ...page,
          items: page.items.map(({ document_id, assigned_to, ...row }) => ({
            ...row,
            renewal_no: row.renewal_no ?? "",
            document_title: documentTitles.get(document_id) ?? "—",
            assigned_to_name: assigned_to === null ? null : profileNames.get(assigned_to) ?? null,
          })),
        };
      }),
    ]);
    signal.throwIfAborted();return{success:true,data:dmsDashboardSchema.parse({criteria:parsed.data,asOf,scope:"permitted_records",total_documents:total,added_this_month:added,added_last_month:prior,
      inbox_pending:pending.status==="ready"?ready(pending.totalCount):pending,expiring_30_days:expiring30,
      review_queue_pending:queue,storage_bytes:storage,documents_by_day:byDay,documents_by_category:byCategory,ai_pipeline:pipeline,expiry_buckets:expiryBuckets,inbox_items:pending,expiring_items:expiring,renewal_items:renewals})};
  }catch{return{success:false,error:"Document dashboard could not be completely loaded. Please retry."};}
}
