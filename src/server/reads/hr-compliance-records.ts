import "server-only";
import {z} from "zod";
import {createTable, getCoreRowModel, getFilteredRowModel, getSortedRowModel} from "@tanstack/table-core";
import {getAuthContext, canUseApplication, type AuthContext} from "@/lib/rbac/check";
import {createClient} from "@/lib/supabase/server";
import {literalLike} from "@/lib/reads/search";
import {collectCompletePages} from "@/lib/reads/complete-pages";
import {COMPLIANCE_CONFIG, DEPENDENT_MEDICAL_FIELDS, complianceCriteriaSchema, complianceRowSchemas, complianceDetailSchemas,
  compliancePageSchema, complianceDetailSchema, complianceAccessSchema, complianceRestrictedSchema, complianceUnavailableSchema, type ComplianceKind} from "@/lib/reads/hr-compliance-records-schema";

const denied = {success: false as const, error: "Permission denied"};
const subjectSchema = z.object({id: z.number().int().positive().refine(Number.isSafeInteger)}).strip();
const joins: Record<ComplianceKind, Record<string, string>> = {
  identity: {document_type: "hr_identity_document_types(id,name_en)", issue_country: "countries(id,name_en)", issuing_emirate: "emirates(id,name_en)", issue_city: "cities(id,name_en)", issuing_authority_party: "parties(id,display_name,party_code)", sponsor_company: "owner_companies!employee_identity_documents_sponsor_company_id_fkey(id,legal_name_en)"},
  insurance: {}, dependents: {relationship_type: "hr_relationship_types(id,name_en)", nationality: "countries(id,name_en)"},
  cards: {access_type: "hr_access_card_types(id,name_en)", work_site: "work_sites(id,site_name)"},
  training: {training_category: "hr_training_categories(id,name_en)", training_type: "hr_training_types(id,name_en)"},
  medical: {medical_record_type: "hr_medical_record_types(id,name_en)"},
};
function projection(kind: ComplianceKind, detail: boolean, medicalView=true) {
  return Object.keys((detail ? complianceDetailSchemas : complianceRowSchemas)[kind].shape).filter(key=>kind!=='dependents'||medicalView||!DEPENDENT_MEDICAL_FIELDS.some(field=>field===key)).map(key => joins[kind][key] ? `${key}:${joins[kind][key]}` : key).join(",");
}
/** Existing text-table semantics (including auto alphanumeric sorting). Only
 * this bounded metadata composition needs the table-core algorithms; no React. */
function compose(rows: Record<string, unknown>[], p: z.infer<typeof complianceCriteriaSchema> & {operation: "page"}) {
  const fields = [...new Set([...COMPLIANCE_CONFIG[p.kind].fields.map(field => field.id), COMPLIANCE_CONFIG[p.kind].sort])];
  const explicitSort = p.sorting !== undefined ? p.sorting : p.sortKey !== COMPLIANCE_CONFIG[p.kind].sort || p.sortDir !== (COMPLIANCE_CONFIG[p.kind].ascending ? "asc" : "desc") ? [{id: p.sortKey, desc: p.sortDir === "desc"}] : [];
  const table = createTable({data: rows, columns: fields.map(id => ({id, accessorFn: (row: Record<string, unknown>) => String(row[id] ?? ""), enableGlobalFilter: COMPLIANCE_CONFIG[p.kind].fields.some(field => field.id === id)})),
    state: {sorting: explicitSort, globalFilter: p.search, columnFilters: Object.entries(p.columnFilters).map(([id, value]) => ({id, value}))},
    onStateChange: () => {}, renderFallbackValue: null, getCoreRowModel: getCoreRowModel(), getFilteredRowModel: getFilteredRowModel(), getSortedRowModel: getSortedRowModel()});
  return table.getSortedRowModel().rows.map(row => row.original);
}

/** One request-local auth/client/capability context. F03 RLS/projection remains
 * authoritative; neither caller input nor broad UI roles can grant read access. */
export async function readHrComplianceRecords(input: unknown, context?: AuthContext, signal?: AbortSignal) {
  const parsed = complianceCriteriaSchema.safeParse(input);
  if (!parsed.success) return {success: false as const, error: "Invalid compliance criteria"};
  try {
    signal?.throwIfAborted();
    const ctx = context ?? await getAuthContext();
    signal?.throwIfAborted();
    if (!canUseApplication(ctx)) return denied;
    const db = await createClient(), p = parsed.data, config = COMPLIANCE_CONFIG[p.kind];
    const bind = <T extends {abortSignal: (s: AbortSignal) => T}>(query: T): T => signal ? query.abortSignal(signal) : query;
    const subject = await bind(db.from("employees").select("id").eq("id", p.employeeId).is("deleted_at", null)).maybeSingle();
    signal?.throwIfAborted();
    if (subject.error) throw Error("Employee authorization unavailable");
    if (!subject.data) return denied;
    if (subjectSchema.parse(subject.data).id !== p.employeeId) throw Error("Employee response mismatch");
    const permissions = new Map<string, Promise<boolean>>();
    const permitted = (code: string) => {
      if (!permissions.has(code)) permissions.set(code, (async () => {
        signal?.throwIfAborted();
        const result = await bind(db.rpc("f03_has_employee_permission", {employee_id: p.employeeId, permission_code: code}));
        signal?.throwIfAborted();
        if (result.error) throw Error("Employee capability unavailable");
        return z.boolean().parse(result.data);
      })());
      return permissions.get(code)!;
    };
    const medicalKind = p.kind === "insurance" || p.kind === "medical";
    const canView = await permitted(medicalKind ? "hr.medical.view" : "hr.compliance.view");
    if (!canView) return {success: true as const, data: complianceRestrictedSchema.parse({operation: p.operation, kind: p.kind, employeeId: p.employeeId, availability: "restricted"})};
    const [canManage, medicalView, medicalManage] = await Promise.all([
      permitted(medicalKind ? "hr.medical.manage" : "hr.compliance.manage"), permitted("hr.medical.view"), permitted("hr.medical.manage"),
    ]);
    const access = complianceAccessSchema.parse({canManage, medicalView, medicalManage: medicalView && medicalManage});
    const query = (select: string, head = false) => bind(db.from(config.table).select(select, {count: "exact", head}).eq("employee_id", p.employeeId).is("deleted_at", null));
    if (p.operation === "detail") {
      const result = await query(projection(p.kind, true,p.kind!=='dependents')).eq("id", p.recordId).maybeSingle();
      signal?.throwIfAborted();
      if (result.error) throw Error("Compliance detail unavailable");
      if (!result.data) return {success: true as const, data: complianceUnavailableSchema.parse({...p, availability: "unavailable"})};
      let projected=p.kind==='dependents'?{...result.data as unknown as Record<string,unknown>,...Object.fromEntries(DEPENDENT_MEDICAL_FIELDS.map(field=>[field,null]))}:result.data;
      if(p.kind==='dependents'&&medicalView){
        const ordinary=result.data as unknown as {id:number;workspace_revision:number};
        const sensitive=await bind(db.rpc('f11_dependent_medical',{p_employee:p.employeeId,p_dependent:p.recordId,p_revision:ordinary.workspace_revision}));
        signal?.throwIfAborted();
        if(sensitive.error)throw Error('Dependent medical read unavailable');
        const medical=z.object({id:subjectSchema.shape.id,employee_id:subjectSchema.shape.id,revision:subjectSchema.shape.id,...Object.fromEntries(DEPENDENT_MEDICAL_FIELDS.map(field=>[field,z.string().nullable()]))}).parse(sensitive.data);
        if(medical.id!==p.recordId||medical.employee_id!==p.employeeId||medical.revision!==ordinary.workspace_revision)throw Error('Dependent changed during protected detail read');
        projected={...projected as Record<string,unknown>,...Object.fromEntries(DEPENDENT_MEDICAL_FIELDS.map(field=>[field,medical[field as keyof typeof medical]]))};
      }
      const row = complianceDetailSchemas[p.kind].parse(projected);
      if (p.kind === "dependents" && !medicalView) for (const key of DEPENDENT_MEDICAL_FIELDS) (row as Record<string, unknown>)[key] = null;
      return {success: true as const, data: complianceDetailSchema.parse({...p, row, access})};
    }
    // Default opens and ordinary text-only filters use native counted pages.
    // Date substrings and user auto-text sorts are not equivalent to SQL date
    // predicates/collations. Compose only minimal complete metadata in that case.
    const dateField = (key: string) => key === "expiry_date" || key === "examination_date";
    const composeRequired = !!p.sorting?.length || p.sortKey !== config.sort || p.sortDir !== (config.ascending ? "asc" : "desc")
      || !!p.search && config.fields.some(f => dateField(f.id)) || Object.entries(p.columnFilters).some(([key, value]) => !!value && dateField(key));
    const from = (p.page - 1) * p.pageSize;
    let rows: unknown, totalCount: number | null;
    if (composeRequired) {
      const keys = [...new Set(["id", config.sort, ...config.fields.map(f => f.id)])];
      const metadataSchema = z.object({id: subjectSchema.shape.id, ...Object.fromEntries(keys.filter(key => key !== "id").map(key => [key, z.string().nullable()]))}).strip();
      const metadata = await collectCompletePages(async (start, end) => {
        const result = await query(keys.join(",")).order(config.sort, {ascending: config.ascending}).order("id").range(start, end);
        signal?.throwIfAborted();
        return {...result, data: result.error ? null : z.array(metadataSchema).parse(result.data)};
      }, {identity: row => row.id, signal, maxRows: 10000}); // Safety bound, not a business limit.
      signal?.throwIfAborted();
      const complete = compose(metadata, p), selected = complete.slice(from, from + p.pageSize);
      totalCount = complete.length;
      if (!selected.length) rows = [];
      else {
        const result = await query(projection(p.kind, false)).in("id", selected.map(r => Number(r.id))).order("id").range(0, p.pageSize - 1);
        signal?.throwIfAborted();
        if (result.error || result.count !== selected.length || !Array.isArray(result.data)) throw Error("Compliance records changed while loading");
        const projected = z.array(complianceRowSchemas[p.kind]).parse(result.data);
        const byId = new Map(projected.map(row => [row.id, row]));
        if (byId.size !== selected.length) throw Error("Incomplete selected compliance rows");
        rows = selected.map(row => {
          const current = byId.get(Number(row.id));
          if (!current || keys.some(key => row[key] !== (current as Record<string, unknown>)[key])) throw Error("Compliance filter or sort values changed while loading");
          return current;
        });
      }
    } else {
      const filtered = (head = false) => {
        const q = query(projection(p.kind, false), head);
        if (p.search) q.ilike(config.fields[0].id, literalLike(p.search)); // The only text-only kind is Dependents.
        for (const [key, value] of Object.entries(p.columnFilters)) if (value) q.ilike(key, literalLike(value));
        return head ? q : q.order(config.sort, {ascending: config.ascending}).order("id", {ascending: true});
      };
      const result = await filtered().range(from, from + p.pageSize - 1);
      signal?.throwIfAborted();
      rows = result.data; totalCount = result.count;
      if (from > 0 && result.status === 416 && result.error?.code === "PGRST103") {
        const count = await filtered(true); signal?.throwIfAborted();
        if (count.error || count.count === null || !Number.isSafeInteger(count.count) || count.count < 0 || count.count > from) throw Error("Unverified compliance range");
        rows = []; totalCount = count.count;
      } else if (result.error) throw Error("Compliance records unavailable");
    }
    signal?.throwIfAborted();
    return {success: true as const, data: compliancePageSchema.parse({operation: "page", kind: p.kind, employeeId: p.employeeId, page: p.page, pageSize: p.pageSize, rows, totalCount, access})};
  } catch {return {success: false as const, error: "Compliance records could not be completely loaded within the safe read bound. Retry or narrow the criteria."};}
}
