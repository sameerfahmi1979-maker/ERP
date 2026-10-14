import {beforeEach, expect, it, vi} from "vitest";
import {readFileSync} from "node:fs";
import type {AuthContext} from "@/lib/rbac/check";
type Row = Record<string, unknown>;
type Call = {table: string; methods: unknown[][]};
const state = vi.hoisted(() => ({auth: {} as AuthContext, authCalls: 0, clients: 0, calls: [] as Call[], rows: {} as Record<string, Row[]>, fault: "", short: false,
  count: undefined as number | null | undefined, selectedCount: undefined as number | null | undefined, exhausted: false, delayed: "", waiters: [] as (() => void)[]}));
vi.mock("@/lib/rbac/check", async () => ({...await vi.importActual("@/lib/rbac/scope"), getAuthContext: async () => {state.authCalls++; return state.auth;}}));
vi.mock("@/lib/supabase/admin", () => ({createAdminClient: () => {throw Error("Privileged client forbidden");}}));
vi.mock("@/lib/supabase/server", () => ({createClient: async () => {
  state.clients++;
  return {from(table: string) {
    const call: Call = {table, methods: []}; state.calls.push(call);
    const builder: Record<string, unknown> = {then: (resolve: (value: unknown) => unknown) => {
      const result = () => {
        const selected = call.methods.some(([m, k]) => m === "eq" && k === "id");
        if (state.fault === table || state.fault === "selected" && selected) return {data: null, count: null, error: {code: "57014", message: "PRIVATE_DATABASE_ERROR"}};
        let rows = [...(state.rows[table] ?? [])];
        const contains = (row: Row, field: string, value: string) => String(row[field] ?? "").toLowerCase().includes(value.toLowerCase());
        for (const [m, key, value] of call.methods) {
          if (m === "eq" || m === "is") rows = rows.filter(row => (row[String(key)] ?? null) === value);
          if (m === "in") rows = rows.filter(row => (value as unknown[]).includes(row[String(key)]));
          if (m === "ilike") rows = rows.filter(row => contains(row, String(key), String(value).slice(1, -1).replace(/\\(.)/g, "$1")));
          if (m === "or") {
            const owner = String(key).match(/^user_profile_id\.eq\.(\d+),is_shared\.eq\.true$/);
            const companies = String(key).match(/^owner_company_id\.is\.null,owner_company_id\.in\.\(([\d,]+)\)$/);
            if (owner) rows = rows.filter(row => row.user_profile_id === Number(owner[1]) || row.is_shared === true);
            else if (companies) rows = rows.filter(row => row.owner_company_id === null || companies[1].split(",").map(Number).includes(Number(row.owner_company_id)));
            else {const clauses = String(key).split(",").map(part => part.match(/^([^.]*)\.ilike\."%(.*)%"$/)); rows = rows.filter(row => clauses.some(part => part && contains(row, part[1], part[2])));}
          }
        }
        const orders = call.methods.filter(([m]) => m === "order");
        rows.sort((a, b) => {for (const [, field, opts] of orders) {const key = String(field), n = typeof a[key] === "string" ? String(a[key]).localeCompare(String(b[key])) : Number(a[key]) - Number(b[key]); if (n) return (opts as {ascending: boolean}).ascending ? n : -n;} return 0;});
        const count = selected && state.selectedCount !== undefined ? state.selectedCount : table !== "erp_report_registry" && state.count !== undefined ? state.count : rows.length;
        const range = call.methods.find(([m]) => m === "range");
        if (state.exhausted && range && Number(range[1]) > 0 && Number(range[1]) >= rows.length) return {data: null, count: null, error: {code: "PGRST103"}, status: 416};
        if (range) rows = rows.slice(Number(range[1]), Number(range[2]) + 1);
        if (state.short && !selected && table !== "erp_report_registry") rows = rows.slice(0, 1);
        const head = (call.methods.find(([m]) => m === "select")?.[2] as {head?: boolean})?.head;
        return {data: head ? null : call.methods.some(([m]) => m === "maybeSingle") ? rows[0] ?? null : rows, count, error: null, status: 200};
      };
      return (state.delayed === table ? new Promise(resolve => state.waiters.push(() => resolve(result()))) : Promise.resolve(result())).then(resolve);
    }};
    for (const method of ["select", "is", "eq", "in", "ilike", "order", "or", "range", "maybeSingle", "abortSignal"]) builder[method] = (...args: unknown[]) => {call.methods.push([method, ...args]); return builder;};
    return builder;
  }};
}}));
import {readReportSavedFilters} from "@/server/reads/report-saved-filters";
import {readReportTemplateSelection} from "@/server/reads/report-template-selection";
import {GET as savedGet, POST as savedPost} from "@/app/api/reads/report-saved-filters/route";
import {GET as templateGet, POST as templatePost} from "@/app/api/reads/report-template-selection/route";
import {reportSavedFiltersPageSchema, reportSavedFilterDetailResponseSchema, reportSavedFiltersListSchema} from "@/lib/reads/report-saved-filters-schema";
import {reportTemplateSelectionPageSchema, reportTemplateSelectionCriteriaSchema, reportTemplateSelectionRowSchema} from "@/lib/reads/report-template-selection-schema";
const codes = ["reports.run", "reports.view", "reports.manage", "reports.saved_filters.manage"];
const date = "2026-10-05T00:00:00Z";
const filter = (id: number, extra: Row = {}) => ({id, report_id: 5, user_profile_id: 11, filter_name: `Filter ${String(id).padStart(5, "0")}`, is_default: false, is_shared: false, created_at: date, updated_at: date, deleted_at: null, filters_json: {employee_id: "7"}, ...extra});
const template = (id: number, extra: Row = {}) => ({id, template_name: `Template ${String(id).padStart(5, "0")}`, template_code: `TEST_${id}`, template_type: "report", is_default: false, governance_status: "approved", visual_editor_engine: null,
  branding_profile_id: 31, branding_profile_name: "Synthetic branding", branding_profile_type: "company", company_name: "Synthetic company", logo_url: null, owner_company_id: 1, selectable: true, ...extra});
const saved = (extra = {}) => readReportSavedFilters({reportCode: "SYNTHETIC", ...extra});
const savedPage = async (extra = {}) => reportSavedFiltersPageSchema.parse((await saved(extra)).data);
const templates = async (extra = {}) => reportTemplateSelectionPageSchema.parse((await readReportTemplateSelection(extra)).data);
beforeEach(() => {
  Object.assign(state, {authCalls: 0, clients: 0, calls: [], fault: "", short: false, count: undefined, selectedCount: undefined, exhausted: false, delayed: "", waiters: []});
  state.auth = {profile: {id: 11, auth_user_id: "synthetic", must_change_password: false}, accountStatus: "active", isAccountActive: true, email: null, roleCodes: [], permissionCodes: codes, globalPermissionCodes: codes,
    roleAssignments: [{roleId: 1, roleCode: "synthetic", ownerCompanyId: null, branchId: null, permissionCodes: codes}]} as unknown as AuthContext;
  state.rows = {erp_report_registry: [{id: 5, report_code: "SYNTHETIC", is_active: true, deleted_at: null, required_permissions: ["reports.run"]}], erp_report_saved_filters: [filter(1)], perf_report_template_selection: [template(1)]};
});
it("saved-filter page is exact, minimal, ordinary, report-bound and own OR shared even for a manager", async () => {
  state.rows.erp_report_saved_filters = [filter(1), filter(2, {user_profile_id: 22, is_shared: true}), filter(3, {user_profile_id: 22}), filter(4, {report_id: 6}), filter(5, {deleted_at: date})];
  const data = await savedPage(); expect(data.rows.map(row => row.id)).toEqual([1, 2]); expect(data.totalCount).toBe(2);
  expect(JSON.stringify(data)).not.toContain("filters_json"); expect(state.clients).toBe(1); expect(state.authCalls).toBe(1);
  expect(state.calls[1].methods).toContainEqual(["or", "user_profile_id.eq.11,is_shared.eq.true"]);
  expect(state.calls[1].methods).toContainEqual(["order", "id", {ascending: true}]);
  expect(state.calls[1].methods.find(([m]) => m === "select")?.[1]).not.toContain("*");
});
it("saved-filter exact search/deep pages find results beyond1000 with no collection walk", async () => {
  state.rows.erp_report_saved_filters = Array.from({length: 1301}, (_, i) => filter(i + 1));
  expect((await savedPage({search: "01301"})).rows[0].id).toBe(1301);
  expect((await savedPage({page: 41})).rows[0].id).toBe(1001);
  expect(state.calls.filter(call => call.table === "erp_report_saved_filters")).toHaveLength(2);
});
it("saved-filter defaults first then name/id and literal whitespace/punctuation remain truthful", async () => {
  state.rows.erp_report_saved_filters = [filter(2, {filter_name: "Same"}), filter(1, {filter_name: "Same"}), filter(3, {is_default: true, filter_name: "Zed"})];
  expect((await savedPage()).rows.map(row => row.id)).toEqual([3, 1, 2]);
  await saved({search: " %_ , "}); expect(state.calls.at(-1)?.methods).toContainEqual(["ilike", "filter_name", "% \\%\\_ , %"]);
  expect(reportSavedFiltersListSchema.parse({reportCode: "SYNTHETIC", search: " "}).search).toBe(" ");
});
it.each([1, 2, 3, 4, 999])("saved detail%d rechecks own/shared/report/deletion with non-enumerating null", async id => {
  state.rows.erp_report_saved_filters = [filter(1), filter(2, {user_profile_id: 22, is_shared: true}), filter(3, {user_profile_id: 22}), filter(4, {report_id: 6})];
  const detail = reportSavedFilterDetailResponseSchema.parse((await saved({mode: "detail", id})).data);
  expect(detail.record?.id ?? null).toBe([1, 2].includes(id) ? id : null);
  if (detail.record) expect(detail.record.filters_json).toEqual({employee_id: "7"});
});
it.each(["inactive", "missing", "required", "deleted"])("saved-filter %s registry denies before saved data", async mode => {
  if (mode === "inactive") state.rows.erp_report_registry[0].is_active = false;
  if (mode === "missing") state.rows.erp_report_registry = [];
  if (mode === "required") state.rows.erp_report_registry[0].required_permissions = ["missing.permission"];
  if (mode === "deleted") state.rows.erp_report_registry[0].deleted_at = date;
  expect(await saved()).toMatchObject({success: false, error: "Permission denied"}); expect(state.calls).toHaveLength(1);
});
it("template list uses only the new caller-bound minimal projection and server count", async () => {
  const data = await templates(); expect(data.totalCount).toBe(1); expect(state.calls.map(call => call.table)).toEqual(["perf_report_template_selection"]);
  expect(state.calls[0].methods).toContainEqual(["range", 0, 24]);
  const projection = String(state.calls[0].methods.find(([m]) => m === "select")?.[1]);
  for (const secret of ["*", "body_", "layout", "stamp", "signature", "security_review_notes", "approval_notes"]) expect(projection).not.toContain(secret);
});
it("template search and deep page cover all rows with stable default/name/id order", async () => {
  state.rows.perf_report_template_selection = Array.from({length: 1301}, (_, i) => template(i + 1));
  expect((await templates({search: "01301"})).rows[0].id).toBe(1301);
  expect((await templates({page: 41})).rows[0].id).toBe(1001); expect(state.calls).toHaveLength(2);
});
it("template owner filter narrows companies but retains independently global-authorized choices; empty adds none", async () => {
  state.rows.perf_report_template_selection = [template(1), template(2, {owner_company_id: 2}), template(3, {owner_company_id: null, branding_profile_id: null})];
  expect((await templates({ownerCompanyIds: [1]})).rows.map(row => row.id)).toEqual([1, 3]);
  expect((await templates({ownerCompanyIds: []})).totalCount).toBe(3);
  expect(state.calls[1].methods.some(([m]) => m === "or")).toBe(false);
});
it.each(["company", "branch", "global-only"])("template DTO independently rejects %s authority mismatch", async mode => {
  state.auth.globalPermissionCodes = []; state.auth.roleAssignments = [{roleId: 2, roleCode: "scoped", ownerCompanyId: 1, branchId: mode === "branch" ? 11 : null, permissionCodes: ["reports.view"]}];
  state.rows.perf_report_template_selection = [template(1, {owner_company_id: mode === "global-only" ? null : mode === "company" ? 2 : 1})];
  expect((await readReportTemplateSelection({})).success).toBe(false);
});
it("inactive selected metadata is preserved outside search/page but cannot become a new choice", async () => {
  state.rows.perf_report_template_selection = [template(1), template(2, {selectable: false})];
  const data = await templates({selectedId: 2, search: "00001"}); expect(data.rows.map(row => row.id)).toEqual([1]); expect(data.selected).toMatchObject({id: 2, selectable: false});
  const selected = state.calls[1]; expect(selected.methods).toContainEqual(["eq", "id", 2]); expect(selected.methods).not.toContainEqual(["eq", "selectable", true]);
});
it("issuable-only lists approved/published while preserving a selected draft as unavailable", async () => {
  state.rows.perf_report_template_selection = [template(1), template(2, {governance_status: "draft"})];
  const data = await templates({issuableOnly: true, selectedId: 2}); expect(data.rows.map(row => row.id)).toEqual([1]); expect(data.selected?.selectable).toBe(false);
});
it("wrong-company selection and hidden selection are null, not privileged existence probes", async () => {
  state.rows.perf_report_template_selection = [template(1), template(2, {owner_company_id: 2})];
  expect((await templates({ownerCompanyIds: [1], selectedId: 2})).selected).toBeNull(); expect((await templates({selectedId: 999})).selected).toBeNull();
});
it("template whitespace and wildcard syntax remains a literal request", async () => {
  await templates({search: " %_ , "}); expect(String(state.calls[0].methods.find(([m]) => m === "or")?.[1])).toContain('"% \\\\%\\\\_ , %"');
  expect(reportTemplateSelectionCriteriaSchema.parse({search: " "}).search).toBe(" ");
});
it.each(["saved", "templates"])("%s ordinary denial retires before client creation", async mode => {
  state.auth.permissionCodes = []; state.auth.globalPermissionCodes = [];
  expect((await (mode === "saved" ? saved() : readReportTemplateSelection({}))).error).toBe("Permission denied"); expect(state.clients).toBe(0);
});
it.each(["saved", "templates"])("%s pre-abort prevents all auth/data work", async mode => {
  const c = new AbortController(); c.abort();
  await expect(mode === "saved" ? readReportSavedFilters({reportCode: "SYNTHETIC"}, undefined, c.signal) : readReportTemplateSelection({}, undefined, c.signal)).rejects.toMatchObject({name: "AbortError"});
  expect(state.clients).toBe(0); expect(state.authCalls).toBe(0);
});
it.each(["erp_report_registry", "erp_report_saved_filters", "perf_report_template_selection"])("%s returned errors never succeed as empty/zero or expose details", async table => {
  state.fault = table; const result = await (table === "perf_report_template_selection" ? readReportTemplateSelection({}) : saved());
  expect(result.success).toBe(false); expect(result.data).toBeUndefined(); expect(JSON.stringify(result)).not.toContain("PRIVATE_DATABASE_ERROR");
});
it.each(["saved", "templates"])("%s missing exact count or short page fails closed", async mode => {
  const invoke = () => mode === "saved" ? saved() : readReportTemplateSelection({});
  state.count = null; expect((await invoke()).success).toBe(false); state.count = undefined;
  state.rows.erp_report_saved_filters.push(filter(2)); state.rows.perf_report_template_selection.push(template(2)); state.short = true; expect((await invoke()).success).toBe(false);
});
it.each(["saved", "templates"])("%s confirmed exhausted page recount remains exact", async mode => {
  state.exhausted = true; const data = mode === "saved" ? await savedPage({page: 3}) : await templates({page: 3}); expect(data.rows).toEqual([]); expect(data.totalCount).toBe(1);
  expect(state.calls.at(-1)?.methods.some(entry => entry[0] === "select" && (entry[2] as {head?: boolean})?.head)).toBe(true);
});
it.each([null, -1, 2, 0.5])("selected read count %s cannot become empty success", async count => {
  state.selectedCount = count; expect((await saved({mode: "detail", id: 1})).success).toBe(false); expect((await readReportTemplateSelection({selectedId: 1})).success).toBe(false);
});
it.each(["erp_report_registry", "erp_report_saved_filters", "perf_report_template_selection"])("%s late response after abort is not exposed", async table => {
  state.delayed = table; const c = new AbortController();
  const promise = table === "perf_report_template_selection" ? readReportTemplateSelection({}, undefined, c.signal) : readReportSavedFilters({reportCode: "SYNTHETIC"}, undefined, c.signal);
  await vi.waitFor(() => expect(state.waiters).toHaveLength(1)); c.abort(); state.waiters[0](); await expect(promise).rejects.toMatchObject({name: "AbortError"});
  for (const call of state.calls) expect(call.methods).toContainEqual(["abortSignal", c.signal]);
  if (table === "erp_report_registry") expect(state.calls.map(call => call.table)).toEqual(["erp_report_registry"]);
  // Preserve the declared SDK modifier-before-cardinality contract.
  if (table !== "perf_report_template_selection") expect(state.calls[0].methods.slice(-2)).toEqual([["abortSignal", c.signal], ["maybeSingle"]]);
});
it.each(["GET", "POST"])("actual %s routes preserve private/no-store and error statuses", async method => {
  for (const [resource, get, post, input, table] of [["report-saved-filters", savedGet, savedPost, {reportCode: "SYNTHETIC"}, "erp_report_saved_filters"], ["report-template-selection", templateGet, templatePost, {}, "perf_report_template_selection"]] as const) {
    const request = () => new Request(`http://localhost/api/reads/${resource}${method === "GET" ? "?params=" + encodeURIComponent(JSON.stringify(input)) : ""}`, method === "POST" ? {method, headers: {"Content-Type": "application/json"}, body: JSON.stringify(input)} : {});
    const route = method === "GET" ? get : post; state.fault = ""; const ok = await route(request()); expect(ok.status).toBe(200); expect(ok.headers.get("cache-control")).toContain("private, no-store"); expect(ok.headers.get("vary")).toBe("Cookie");
    state.fault = table; const failed = await route(request()); expect(failed.status).toBe(503); expect(await failed.text()).not.toContain("PRIVATE_DATABASE_ERROR");
  }
});
it.each([{page: 0}, {pageSize: 101}, {search: "x".repeat(201)}, {role: "admin"}])("invalid criteria%j never authorizes", async input => {
  expect((await saved(input)).error).toMatch(/^Invalid /); expect((await readReportTemplateSelection(input)).error).toMatch(/^Invalid /); expect(state.authCalls).toBe(0);
});
it("schemas reject impossible page/selection contracts and strip unknown sensitive row fields", () => {
  const data = {criteria: reportTemplateSelectionCriteriaSchema.parse({selectedId: 1}), rows: [template(1)], totalCount: 1, selected: template(1)};
  expect(reportTemplateSelectionPageSchema.safeParse({...data, rows: [template(1, {selectable: false})]}).success).toBe(false);
  expect(reportTemplateSelectionPageSchema.safeParse({...data, selected: template(2)}).success).toBe(false);
  expect(reportTemplateSelectionPageSchema.safeParse({...data, selected: template(1, {template_name: "Drift"})}).success).toBe(false);
  expect(JSON.stringify(reportTemplateSelectionPageSchema.parse({...data, rows: [template(1, {signature_url: "PRIVATE"})]}))).not.toContain("PRIVATE");
});
const readTemplateSelectionContract = () => readFileSync(new URL("../../tooling/performance/contracts/report-template-selection-proposal.sql", import.meta.url), "utf8");
const sqlWhitespacePattern = (text: string) => text.trim().split(/\s+/).map(token => token.replace(/[.*+?^$(){}|[\]\\]/g, "\\$&")).join("\\s+");
function assertTemplateSelectionContract(sql: string) {
  // This authored artifact has a deliberately closed grammar, not a general SQL parser.
  // Only full-line header comments are permitted; none can supply executable markers.
  const executable = sql.replace(/^(?:(?:[ \t]*--[^\r\n]*)?[ \t]*\r?\n)*/, "");
  const [raise, view, rollback] = ["RAISE EXCEPTION", "CREATE VIEW public.perf_report_template_selection", "ROLLBACK;"].map(marker => executable.indexOf(marker));
  for (const position of [raise, view, rollback]) expect(position).toBeGreaterThanOrEqual(0);
  expect(raise).toBeLessThan(view); expect(view).toBeLessThan(rollback);
  expect(executable.trimEnd().endsWith("ROLLBACK;")).toBe(true);
  expect(sql).not.toMatch(/\bCOMMIT\b/i);
  expect(executable).not.toMatch(/--|\/\*|\*\//);
  expect(executable.match(/\bCREATE VIEW\b/g)).toHaveLength(1);
  expect(executable.match(/\bROLLBACK;/g)).toHaveLength(1);
  expect(sql).toContain("security_invoker = true"); expect(sql).toContain("public.erp_report_branding_profiles_safe"); expect(sql).toContain("erp_private.can_read_report_template_branding(t.branding_profile_id)");
  expect(sql).not.toMatch(/JOIN public\.erp_report_branding_profiles\s/);
  for (const field of ["body_html", "layout_json", "signature_url", "stamp_url", "security_review_notes", "approval_notes"]) expect(sql).not.toContain(field);
  expect(executable).not.toContain("*");
  const projection = [
    "t.id", "t.template_code", "t.template_name", "t.template_type", "COALESCE(t.is_default, false)",
    "t.governance_status", "t.visual_editor_engine", "t.branding_profile_id", "p.profile_name", "p.profile_type",
    "CASE WHEN p.owner_company_id IS NOT NULL THEN COALESCE(p.legal_name_en, p.trade_name_en, p.profile_name) ELSE NULL::text END",
    "p.logo_url", "p.owner_company_id", "COALESCE(t.is_active, false) AND (t.branding_profile_id IS NULL OR COALESCE(p.is_active, false))",
  ];
  const structure = new RegExp("^\\s*" + sqlWhitespacePattern(
    "BEGIN; DO $report_template_selection_contract$ BEGIN " +
    "RAISE EXCEPTION 'Inert report template selection contract: execution is not permitted.'; " +
    "END; $report_template_selection_contract$; CREATE VIEW public.perf_report_template_selection",
  ) + "\\s*\\(\\s*([a-z_]+(?:\\s*,\\s*[a-z_]+)*)\\s*\\)\\s+" + sqlWhitespacePattern(
    "WITH (security_invoker = true, security_barrier = true) AS SELECT " + projection.join(", ") +
    " FROM public.erp_report_templates t LEFT JOIN public.erp_report_branding_profiles_safe p ON p.id = t.branding_profile_id " +
    "WHERE t.deleted_at IS NULL AND (SELECT erp_private.business_principal_is_active()) " +
    "AND erp_private.can_read_report_template_branding(t.branding_profile_id) " +
    "AND (t.branding_profile_id IS NULL OR p.id IS NOT NULL); " +
    "ALTER VIEW public.perf_report_template_selection OWNER TO postgres; " +
    "REVOKE ALL ON public.perf_report_template_selection FROM PUBLIC, anon, authenticated, service_role; " +
    "GRANT SELECT ON public.perf_report_template_selection TO authenticated; ROLLBACK;",
  ) + "\\s*$");
  const match = executable.match(structure);
  expect(match, "Only the complete inert projection and narrow authority contract is permitted").not.toBeNull();
  const columns = match![1].split(",").map(column => column.trim());
  expect(columns).toHaveLength(14);
  expect(columns).toEqual(Object.keys(reportTemplateSelectionRowSchema.shape));
  return columns;
}
it("inert contract structure and required authority/projection intent match the actual reader and DTO", async () => {
  const columns = assertTemplateSelectionContract(readTemplateSelectionContract());
  await templates();
  const projection = String(state.calls[0].methods.find(([method]) => method === "select")?.[1]);
  expect(columns).toHaveLength(14);
  expect(columns).toEqual(Object.keys(reportTemplateSelectionRowSchema.shape));
  expect(columns).toEqual(projection.split(","));
});
it("inert contract accepts equivalent LF and CRLF checkout newlines", () => {
  const lf = readTemplateSelectionContract().replace(/\r\n/g, "\n");
  expect(assertTemplateSelectionContract(lf.replace(/\n/g, "\r\n"))).toEqual(assertTemplateSelectionContract(lf));
});
const contractMutations: [string, (sql: string) => string][] = [
  ["missing raise", sql => sql.replace(/  RAISE EXCEPTION [^\r\n]+\r?\n/, "")],
  ["missing view", sql => sql.replace("CREATE VIEW", "CREATE")],
  ["missing rollback", sql => sql.replace("ROLLBACK;", "")],
  ["creation before raise", sql => {
    const barrier = sql.match(/DO \$report_template_selection_contract\$[\s\S]*?\$report_template_selection_contract\$;/)![0];
    return sql.replace(barrier, "").replace("ROLLBACK;", barrier + "\nROLLBACK;");
  }],
  ["commented-out raise", sql => sql.replace("  RAISE EXCEPTION", "  -- RAISE EXCEPTION")],
  ["raise marker only in a header comment", sql => "-- RAISE EXCEPTION\n" + sql.replace(/  RAISE EXCEPTION [^\r\n]+\r?\n/, "")],
  ["conditional raise", sql => sql.replace(/  RAISE EXCEPTION ([^\r\n]+)/, "  IF false THEN\n    RAISE EXCEPTION $1\n  END IF;")],
  ["caught raise", sql => sql.replace(/END;\s*\$report_template_selection_contract\$;/, "EXCEPTION WHEN OTHERS THEN NULL;\nEND;\n$report_template_selection_contract$;")],
  ["missing transaction start", sql => sql.replace(/BEGIN;\s*DO /, "DO ")],
  ["premature END", sql => sql.replace("CREATE VIEW", "END;\nCREATE VIEW")],
  ["premature ABORT", sql => sql.replace("CREATE VIEW", "ABORT;\nCREATE VIEW")],
  ["rollback and restart", sql => sql.replace("CREATE VIEW", "ROLLBACK;\nBEGIN;\nCREATE VIEW")],
  ["extra executable statement", sql => sql.replace("CREATE VIEW", "SELECT 1;\nCREATE VIEW")],
  ["client metacommand", sql => sql.replace("CREATE VIEW", "\\set ON_ERROR_STOP off\nCREATE VIEW")],
  ["fifteenth SELECT expression with fourteen output names", sql => sql.replace("  t.id,", "  t.id,\n  t.id,")],
  ["missing deletion predicate", sql => sql.replace("t.deleted_at IS NULL", "true")],
  ["missing principal predicate", sql => sql.replace("(SELECT erp_private.business_principal_is_active())", "true")],
  ["missing branding authority predicate", sql => sql.replace("erp_private.can_read_report_template_branding(t.branding_profile_id)", "true")],
  ["missing visible-branding predicate", sql => sql.replace("(t.branding_profile_id IS NULL OR p.id IS NOT NULL)", "true")],
  ["authority bypassed by OR TRUE", sql => sql.replace("(t.branding_profile_id IS NULL OR p.id IS NOT NULL);", "(t.branding_profile_id IS NULL OR p.id IS NOT NULL) OR TRUE;")],
  ["raw-branding join", sql => sql.replace("public.erp_report_branding_profiles_safe p", "public.erp_report_branding_profiles p")],
  ["inner instead of left join", sql => sql.replace("LEFT JOIN", "INNER JOIN")],
  ["extra grant", sql => sql.replace("ROLLBACK;", "GRANT SELECT ON public.perf_report_template_selection TO anon;\nROLLBACK;")],
  ["active list filter in the view", sql => sql.replace("(t.branding_profile_id IS NULL OR p.id IS NOT NULL);", "(t.branding_profile_id IS NULL OR p.id IS NOT NULL) AND t.is_active = true;")],
  ["issuable list filter in the view", sql => sql.replace("(t.branding_profile_id IS NULL OR p.id IS NOT NULL);", "(t.branding_profile_id IS NULL OR p.id IS NOT NULL) AND t.governance_status IN ('approved', 'published');")],
  ["additional UNION", sql => sql.replace("(t.branding_profile_id IS NULL OR p.id IS NOT NULL);", "(t.branding_profile_id IS NULL OR p.id IS NOT NULL) UNION SELECT 1;")],
  ["extra view", sql => sql.replace("ROLLBACK;", "CREATE VIEW public.unexpected AS SELECT 1;\nROLLBACK;")],
  ["transaction commit", sql => sql.replace("ROLLBACK;", "COMMIT;\nROLLBACK;")],
  ["statement after rollback", sql => sql + "\nSELECT 1;"],
];
it.each(contractMutations)("inert contract rejects %s", (_name, mutate) => {
  const sql = readTemplateSelectionContract(), changed = mutate(sql);
  expect(changed).not.toBe(sql);
  expect(() => assertTemplateSelectionContract(changed)).toThrow();
});
