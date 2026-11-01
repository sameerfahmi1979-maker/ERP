import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { canUseApplication } from "@/lib/rbac/scope";
import { entityReferenceSchema, type AiEntityReference } from "@/lib/ai/foundation/contracts";

const sources = {
  company: { table: "owner_companies", columns: "id,trade_name,company_code,updated_at", label: "trade_name", code: "company_code", permissions: ["organizations.view"] },
  party: { table: "parties", columns: "id,display_name,party_code,updated_at", label: "display_name", code: "party_code", permissions: ["master_data.parties.view", "master_data.party_master.view"] },
  branch: { table: "branches", columns: "id,branch_name_en,branch_code,updated_at", label: "branch_name_en", code: "branch_code", permissions: ["branches.view"] },
  site: { table: "work_sites", columns: "id,site_name,site_code,updated_at", label: "site_name", code: "site_code", permissions: ["common_md.view", "common_md.work_sites.view"] },
  dms_document: { table: "dms_documents", columns: "id,title,document_no,updated_at", label: "title", code: "document_no", permissions: ["dms.documents.view"] },
  employee: { table: "employees", columns: "id,full_name_en,employee_code,updated_at", label: "full_name_en", code: "employee_code", permissions: ["hr.employees.view"] },
  dependent: { table: "employee_dependents", columns: "id,dependent_name_en,updated_at", label: "dependent_name_en", code: "dependent_name_en", permissions: ["hr.employees.view"] },
} as const;
const aliases: Record<string, AiEntityReference["entityType"]> = { organization: "company", document: "dms_document", work_site: "site" };

export function normalizeAssistantReference(entityType: string, entityId: number): AiEntityReference | null {
  const parsed = entityReferenceSchema.safeParse({ entityType: aliases[entityType] ?? entityType, entityId });
  return parsed.success ? parsed.data : null;
}

export type AuthorizedAssistantEntity = {
  reference: AiEntityReference;
  label: string;
  businessCode: string | null;
  version: string;
};

/** Minimal row read through the user client and current RLS; never a service key. */
export async function readAuthorizedAssistantEntity(entityType: string, entityId: number): Promise<AuthorizedAssistantEntity | null> {
  const reference = normalizeAssistantReference(entityType, entityId);
  if (!reference || !(reference.entityType in sources)) return null;
  const ctx = await getAuthContext();
  if (!canUseApplication(ctx)) return null;
  const source = sources[reference.entityType as keyof typeof sources];
  if (!source.permissions.some(code => hasPermission(ctx, code))) return null;
  const db = await createClient();
  if (reference.entityType === "dms_document") {
    const allowed = await db.rpc("f03_has_document_permission", { document_id: entityId, permission_code: "dms.documents.view" });
    if (allowed.error) throw new Error("Document authority unavailable");
    if (allowed.data !== true) return null;
  }
  let lookup = db.from(source.table).select(source.columns).eq("id", entityId);
  if (reference.entityType === "employee" || reference.entityType === "dependent") lookup = lookup.is("deleted_at", null);
  const { data, error } = await lookup.maybeSingle();
  if (error) throw new Error("Record authority unavailable");
  const row = data as Record<string, unknown> | null;
  if (!row || row.id !== entityId || typeof row.updated_at !== "string") return null;
  const label = row[source.label], code = row[source.code];
  return { reference, label: typeof label === "string" && label.trim() ? label.slice(0, 200) : "Record", businessCode: typeof code === "string" ? code.slice(0, 100) : null, version: row.updated_at };
}
