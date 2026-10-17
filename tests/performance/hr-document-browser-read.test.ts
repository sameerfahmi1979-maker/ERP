import {afterEach, beforeEach, expect, it, vi} from "vitest";
import type {AuthContext} from "@/lib/rbac/check";
type Row = Record<string, unknown>;
type Call = {table: string; methods: unknown[][]};
const state = vi.hoisted(() => ({ctx: {} as AuthContext, authorizations: 0, clients: 0, calls: [] as Call[], rows: {} as Record<string, Row[]>, fault: "", malformed: "", short: "", count: undefined as number | null | undefined, range416: false,
  rpcFault: false, preview: true, download: true, rpc: [] as unknown[][]}));
vi.mock("@/lib/rbac/check", async () => ({...await import("@/lib/rbac/scope"), getAuthContext: async () => {state.authorizations++; return state.ctx;}}));
vi.mock("@/lib/supabase/server", () => ({createClient: async () => {
  state.clients++;
  return {rpc: async (...args: unknown[]) => {state.rpc.push(args); return {error: state.rpcFault ? {message: "SYNTHETIC_PRIVATE"} : null, data: (args[1] as {permission_code: string}).permission_code.endsWith("preview") ? state.preview : state.download};},
    from: (table: string) => {
      const call: Call = {table, methods: []}; state.calls.push(call);
      const builder: Record<string, unknown> = {then: (resolve: (r: unknown) => unknown) => {
        if (state.fault === table) return Promise.resolve({data: null, count: null, error: {message: "SYNTHETIC_PRIVATE"}}).then(resolve);
        let rows = [...(state.rows[table] ?? [])];
        for (const [method, key, value] of call.methods) {
          if (method === "eq") rows = rows.filter(row => row[String(key)] === value);
          if (method === "is") rows = rows.filter(row => (row[String(key)] ?? null) === value);
          if (method === "in") rows = rows.filter(row => (value as unknown[]).includes(row[String(key)]));
          if (method === "ilike") {const term = String(value).slice(1, -1).replace(/\\([%_\\])/g, "$1").toLowerCase(); rows = rows.filter(row => String(row[String(key)] ?? "").toLowerCase().includes(term));}
          if (method === "or" && String(key).startsWith("employee_status")) rows = rows.filter(row => row.employee_status !== "active");
          if (method === "or" && String(key).startsWith("full_name_en")) {
            const expression = String(key), ids = expression.match(/id\.in\.\(([^)]+)\)/)?.[1].split(",").map(Number) ?? [];
            const term = expression.match(/full_name_en\.ilike\."%([^%]*)%"/)?.[1].toLowerCase() ?? "NEVER_MATCH";
            rows = rows.filter(row => ids.includes(Number(row.id)) || String(row.full_name_en).toLowerCase().includes(term) || String(row.employee_code).toLowerCase().includes(term));
          }
        }
        const orders = call.methods.filter(m => m[0] === "order");
        rows.sort((a, b) => {for (const [, key, options] of orders) {const k = String(key); let c = a[k] == null ? b[k] == null ? 0 : 1 : b[k] == null ? -1 : typeof a[k] === "number" ? Number(a[k]) - Number(b[k]) : String(a[k]).localeCompare(String(b[k])); if ((options as {ascending?: boolean} | undefined)?.ascending === false) c = -c; if (c) return c;} return 0;});
        const select = call.methods.find(m => m[0] === "select"), head = (select?.[2] as {head?: boolean} | undefined)?.head;
        const count = state.count !== undefined && table !== "dms_documents" ? state.count : rows.length;
        const range = call.methods.find(m => m[0] === "range");
        if (state.range416 && range && Number(range[1]) >= rows.length && Number(range[1]) > 0) return Promise.resolve({data: null, count: null, error: {code: "PGRST103"}, status: 416}).then(resolve);
        if (range) rows = rows.slice(Number(range[1]), Number(range[2]) + 1);
        if (state.short === table) rows = rows.slice(0, 1);
        if (state.malformed === table) rows = [{id: "bad"}];
        const point = call.methods.some(m => m[0] === "maybeSingle");
        return Promise.resolve({data: head ? null : point ? rows[0] ?? null : rows, count, error: null, status: 200}).then(resolve);
      }};
      for (const method of ["select", "eq", "is", "in", "or", "ilike", "order", "range", "maybeSingle", "abortSignal"]) builder[method] = (...args: unknown[]) => {call.methods.push([method, ...args]); return builder;};
      return builder;
    }};
}}));
import {readHrDocumentBrowser} from "@/server/reads/hr-document-browser";
import {POST} from "@/app/api/reads/hr-document-browser/route";
import {hrBrowserEmployeesPage, hrBrowserDependentsPage, hrBrowserDocumentsPage, hrBrowserFilesPage, hrBrowserFilesUnavailable, hrDocumentBrowserCriteriaSchema} from "@/lib/reads/hr-document-browser-schema";
const codes = ["hr.employees.view", "dms.documents.view"];
const employee = (id: number, extra: Row = {}) => ({id, employee_code: `SYN-${id}`, full_name_en: `Synthetic ${String(id).padStart(5, "0")}`, employee_status: "active", deleted_at: null, ...extra});
const dependent = (id: number, extra: Row = {}) => ({id, employee_id: 1, dependent_name_en: `Child ${id}`, dms_document_id: null, relationship_type: {name_en: "Child"}, deleted_at: null, ...extra});
const doc = (id: number, extra: Row = {}) => ({id, document_no: `DOC-${id}`, title: `Document ${id}`, status: "active", issue_date: "2026-01-01", expiry_date: null, document_type: {name_en: "Evidence"}, deleted_at: null, ...extra});
const identity = (id: number, extra: Row = {}) => ({id, employee_id: 1, document_number: `ID-${id}`, issue_date: null, expiry_date: null, status: "active", dms_document_id: null, doc_type: {name_en: "Passport"}, deleted_at: null, ...extra});
const link = (id: number, documentId: number, extra: Row = {}) => ({id, document_id: documentId, entity_type: "employee", entity_id: 1, deleted_at: null, ...extra});
const file = (id: number, extra: Row = {}) => ({id, document_id: 2, file_name: `Synthetic ${id}.pdf`, mime_type: "application/pdf", file_size_bytes: 12, deleted_at: null, ...extra});
beforeEach(() => {state.ctx = {profile: {id: 1, auth_user_id: "synthetic", must_change_password: false}, accountStatus: "active", isAccountActive: true, email: null,
  roleCodes: [], permissionCodes: codes, roleAssignments: []} as unknown as AuthContext; state.rows = {employees: [employee(1)], employee_dependents: [dependent(7)], dms_document_links: [link(1, 2)], dms_documents: [doc(2)], employee_identity_documents: [], dms_document_files: [file(1)]};});
afterEach(() => {Object.assign(state, {authorizations: 0, clients: 0, calls: [], fault: "", malformed: "", short: "", count: undefined, range416: false, preview: true, download: true, rpcFault: false, rpc: []});});
const documents = (extra = {}) => readHrDocumentBrowser({operation: "documents", entityType: "employee", entityId: 1, ...extra});
const files = (extra = {}) => readHrDocumentBrowser({operation: "files", entityType: "employee", entityId: 1, documentId: 2, ...extra});
it("ordinary open is one request/context/client and one exact 25-row employee page, not an organization tree", async () => {
  state.rows.employees = Array.from({length: 1107}, (_, i) => employee(i + 1));
  const result = await readHrDocumentBrowser({operation: "employees"}), page = hrBrowserEmployeesPage.parse(result.data);
  expect(page.totalCount).toBe(1107); expect(page.rows).toHaveLength(25); expect(state.authorizations).toBe(1); expect(state.clients).toBe(1); expect(state.calls).toHaveLength(1);
  expect(state.calls[0].methods).toContainEqual(["range", 0, 24]); expect(state.calls[0].methods).toContainEqual(["select", "id,employee_code,full_name_en,employee_status", {count: "exact", head: false}]);
});
it("native navigation reaches beyond provider caps and preserves all/active/inactive status semantics", async () => {
  state.rows.employees = Array.from({length: 1107}, (_, i) => employee(i + 1));
  const page = hrBrowserEmployeesPage.parse((await readHrDocumentBrowser({operation: "employees", page: 45})).data); expect(page.totalCount).toBe(1107); expect(page.rows[0].id).toBe(1101);
  state.rows.employees = [employee(1), employee(2, {employee_status: "probation"}), employee(3, {employee_status: "archived"})];
  expect(hrBrowserEmployeesPage.parse((await readHrDocumentBrowser({operation: "employees", status: "inactive"})).data).rows.map(r => r.id)).toEqual([2, 3]);
  expect(hrBrowserEmployeesPage.parse((await readHrDocumentBrowser({operation: "employees", status: "active"})).data).rows.map(r => r.id)).toEqual([1]);
});
it("dependent expansion independently verifies the parent then pages only its children", async () => {
  state.rows.employee_dependents = [...Array.from({length: 31}, (_, i) => dependent(i + 1)), dependent(100, {employee_id: 2})];
  const page = hrBrowserDependentsPage.parse((await readHrDocumentBrowser({operation: "dependents", employeeId: 1, page: 2})).data);
  expect(page.totalCount).toBe(31); expect(page.rows).toHaveLength(6); expect(state.calls.map(c => c.table)).toEqual(["employees", "employee_dependents"]);
  expect(state.calls[1].methods).toContainEqual(["eq", "employee_id", 1]); expect(state.calls[1].methods).toContainEqual(["range", 25, 49]);
});
it("dependent-name search collects only matched lean IDs and keeps final native employee ordering/count", async () => {
  state.rows.employees = [employee(1), employee(2), employee(3, {full_name_en: "Matching"})]; state.rows.employee_dependents = [dependent(7, {employee_id: 2, dependent_name_en: "Matching child"})];
  const result = await readHrDocumentBrowser({operation: "employees", search: "Matching"}); expect(hrBrowserEmployeesPage.parse(result.data).rows.map(r => r.id)).toEqual([3, 2]);
  expect(state.calls[0].methods).toContainEqual(["select", "id,employee_id", {count: "exact", head: false}]); expect(state.calls[1].methods).toContainEqual(["or", 'full_name_en.ilike."%Matching%",employee_code.ilike."%Matching%",id.in.(2)']);
});
it("oversized dependent-name unions are explicit unverified outcomes, never the first 200 parents", async () => {
  state.rows.employee_dependents = Array.from({length: 201}, (_, i) => dependent(i + 1, {employee_id: i + 1, dependent_name_en: "Matching"}));
  const result = await readHrDocumentBrowser({operation: "employees", search: "Matching"}); expect(result.data).toMatchObject({availability: "too_large"}); expect(result.data).not.toHaveProperty("rows"); expect(result.data).not.toHaveProperty("totalCount");
  expect(state.calls.every(c => c.table === "employee_dependents")).toBe(true);
});
it.each(["missing-hr", "missing-dms", "suspended", "password"])("%s stops before creating a database client", async mode => {
  if (mode === "missing-hr") state.ctx.permissionCodes = [codes[1]]; if (mode === "missing-dms") state.ctx.permissionCodes = [codes[0]];
  if (mode === "suspended") state.ctx.isAccountActive = false; if (mode === "password") state.ctx.profile!.must_change_password = true;
  expect(await documents()).toEqual({success: false, error: "Permission denied"}); expect(state.clients).toBe(0);
});
it.each(["employee", "dependent", "parent"])("invisible %s is terminal subject denial, not a permitted empty file list", async kind => {
  if (kind !== "dependent") state.rows.employees = []; if (kind === "dependent") state.rows.employee_dependents = [];
  const result = await readHrDocumentBrowser({operation: "documents", entityType: kind === "employee" ? "employee" : "employee_dependent", entityId: kind === "employee" ? 1 : 7});
  expect(result.error).toBe("Permission denied"); expect(state.calls.some(c => c.table.startsWith("dms_"))).toBe(false);
});
it("retains direct-link priority, identity fallback metadata, inaccessible DMS masking and distinct null-ID records", async () => {
  state.rows.dms_document_links = [link(1, 2), link(2, 2)]; state.rows.dms_documents = [doc(2, {expiry_date: "2026-12-01"}), doc(3, {title: "Linked identity", expiry_date: "2027-01-01"})];
  state.rows.employee_identity_documents = [identity(1, {dms_document_id: 2, expiry_date: "2026-01-01"}), identity(2, {dms_document_id: 3, expiry_date: "2026-02-01"}), identity(3, {dms_document_id: 99}), identity(4), identity(5)];
  const page = hrBrowserDocumentsPage.parse((await documents()).data); expect(page.totalCount).toBe(5);
  expect(page.rows.map(r => r.key)).toEqual(["dms:3", "dms:2", "identity:3", "identity:4", "identity:5"]);
  expect(page.rows[0]).toMatchObject({title: "Linked identity", expiryDate: "2026-02-01", source: "hr_identity", typeNameEn: "Passport"});
  expect(page.rows[1]).toMatchObject({expiryDate: "2026-12-01", source: "dms_link"}); expect(page.rows[2]).toMatchObject({id: null, title: "Passport — ID-3"});
  expect(state.calls.some(c => c.table === "dms_document_files")).toBe(false); expect(JSON.stringify(page)).not.toContain("storage_path");
});
it("complete selected union crosses 1000 rows with exact page/filter/sort over every source", async () => {
  state.rows.dms_document_links = Array.from({length: 1107}, (_, i) => link(i + 1, i + 1)); state.rows.dms_documents = Array.from({length: 1107}, (_, i) => doc(i + 1, {title: `Title ${String(i + 1).padStart(5, "0")}`}));
  const page = hrBrowserDocumentsPage.parse((await documents({page: 45, sortKey: "title", sortDir: "asc"})).data); expect(page.rows[0].id).toBe(1101); expect(page.totalCount).toBe(1107);
  expect(state.calls.filter(c => c.table === "dms_document_links").map(c => c.methods.find(m => m[0] === "range"))).toEqual([["range", 0, 499], ["range", 500, 999], ["range", 1000, 1499]]);
  expect(state.calls.filter(c => c.table === "dms_documents").every(c => (c.methods.find(m => m[0] === "in")?.[2] as number[]).length <= 200)).toBe(true);
  const match = hrBrowserDocumentsPage.parse((await documents({search: "01107", columnFilters: {source: "dms_link"}})).data); expect(match.totalCount).toBe(1); expect(match.rows[0].id).toBe(1107);
});
it("legacy dependent links are merged once behind independent dependent and employee authorization", async () => {
  state.rows.employee_dependents = [dependent(7, {dms_document_id: 2})]; state.rows.dms_document_links = [link(1, 2, {entity_type: "employee_dependent", entity_id: 7})];
  const page = hrBrowserDocumentsPage.parse((await readHrDocumentBrowser({operation: "documents", entityType: "employee_dependent", entityId: 7})).data); expect(page.rows).toHaveLength(1); expect(page.rows[0].source).toBe("dependent_link");
  expect(state.calls[0].table).toBe("employee_dependents"); expect(state.calls[1].table).toBe("employees"); expect(state.calls.some(c => c.table === "employee_identity_documents")).toBe(false);
});
it.each(["dms_document_links", "employee_identity_documents", "dms_documents", "employee_dependents"])("%s failures cannot silently produce a partial-success union", async table => {
  state.fault = table; const result = table === "employee_dependents" ? await readHrDocumentBrowser({operation: "documents", entityType: "employee_dependent", entityId: 7}) : await documents();
  expect(result.success).toBe(false); expect(result.data).toBeUndefined(); expect(JSON.stringify(result)).not.toContain("PRIVATE");
});
it("composition ceiling returns no partial list or successful zero", async () => {
  state.count = 5001; const result = await documents(); expect(result.data).toMatchObject({availability: "too_large"}); expect(result.data).not.toHaveProperty("rows");
});
it("on-demand files verify subject, membership and document, then page only selected protected metadata", async () => {
  state.rows.dms_document_files = Array.from({length: 1107}, (_, i) => file(i + 1)); state.preview = false;
  const result = hrBrowserFilesPage.parse((await files({page: 45})).data); expect(result.rows).toHaveLength(7); expect(result.rows[0].id).toBe(1101); expect(result.canPreview).toBe(false); expect(result.canDownload).toBe(true);
  expect(state.rpc).toEqual([["f03_has_document_permission", {document_id: 2, permission_code: "dms.documents.preview"}], ["f03_has_document_permission", {document_id: 2, permission_code: "dms.documents.download"}]]);
  const call = state.calls.find(c => c.table === "dms_document_files")!; expect(call.methods).toContainEqual(["eq", "document_id", 2]); expect(call.methods).toContainEqual(["range", 1100, 1124]);
  expect(call.methods.find(m => m[0] === "select")?.[1]).toBe("id,document_id,file_name,mime_type,file_size_bytes");
});
it.each(["membership", "document"])("invisible %s file target is row-free non-enumerating unavailable, not an empty available page", async mode => {
  if (mode === "membership") state.rows.dms_document_links = []; else state.rows.dms_documents = [];
  const data = hrBrowserFilesUnavailable.parse((await files()).data); expect(Object.keys(data).sort()).toEqual(["asOf", "availability", "criteria"]); expect(state.rpc).toHaveLength(0);
  expect(state.calls.some(c => c.table === "dms_document_files")).toBe(false);
});
it.each(["dms_document_files", "capability"])("%s failure cannot be reported as no attachments/denied capability", async mode => {
  if (mode === "capability") state.rpcFault = true; else state.fault = mode;
  expect((await files()).success).toBe(false);
});
it.each([null, -1, 1.5])("invalid native count %s rejects completeness", async count => {state.count = count; expect((await readHrDocumentBrowser({operation: "employees"})).success).toBe(false);});
it.each(["employees", "employee_dependents", "dms_documents"])("malformed %s projection is rejected", async table => {
  state.malformed = table; const result = table === "employees" ? await readHrDocumentBrowser({operation: "employees"}) : table === "employee_dependents" ? await readHrDocumentBrowser({operation: "dependents", employeeId: 1}) : await documents(); expect(result.success).toBe(false);
});
it("short native and composed pages reject provider-cap truncation", async () => {
  state.rows.employees = [employee(1), employee(2)]; state.short = "employees"; expect((await readHrDocumentBrowser({operation: "employees"})).success).toBe(false);
  state.short = "dms_document_links"; state.rows.dms_document_links = [link(1, 2), link(2, 3)]; expect((await documents()).success).toBe(false);
});
it("verified 416 range exhaustion becomes a truthful empty page with exact remaining total", async () => {
  state.range416 = true; const page = hrBrowserEmployeesPage.parse((await readHrDocumentBrowser({operation: "employees", page: 5})).data); expect(page.totalCount).toBe(1); expect(page.rows).toEqual([]);
  expect(state.calls).toHaveLength(2); expect(state.calls[1].methods.find(m => m[0] === "select")?.[2]).toEqual({count: "exact", head: true});
});
it.each([{operation: "employees", pageSize: 101}, {operation: "documents", entityType: "employee", entityId: -1}, {operation: "documents", entityType: "employee", entityId: 1, sortKey: "storage_path"}, {operation: "employees", search: "a".repeat(201)}, {operation: "files", entityType: "employee", entityId: 1, documentId: 2, storage_bucket: "private"}])("invalid criteria stop without auth/native reads: %j", async input => {
  expect(hrDocumentBrowserCriteriaSchema.safeParse(input).success).toBe(false); expect((await readHrDocumentBrowser(input)).success).toBe(false); expect(state.authorizations).toBe(0); expect(state.calls).toHaveLength(0);
});
it("route uses private headers and sanitized 400/403/503 outcomes", async () => {
  const request = (data: unknown) => new Request("http://synthetic/api/reads/hr-document-browser", {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify(data)});
  const result = await POST(request({operation: "employees"})); expect(result.status).toBe(200); expect(result.headers.get("Cache-Control")).toContain("no-store"); expect(result.headers.get("Vary")).toBe("Cookie");
  expect((await POST(request({operation: "invalid"}))).status).toBe(400); state.ctx.permissionCodes = []; expect((await POST(request({operation: "employees"}))).status).toBe(403);
  state.ctx.permissionCodes = codes; state.fault = "employees"; const failed = await POST(request({operation: "employees"})); expect(failed.status).toBe(503); expect(await failed.text()).not.toContain("PRIVATE");
});
