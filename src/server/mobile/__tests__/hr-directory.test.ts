import { describe, expect, it, vi } from "vitest";
import { directory } from "../hr-directory";
import type { Db } from "../hr-reads";
import { photoBinding } from "../hr-photo";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/rbac/check", () => ({ canUseApplication: () => true, getAuthContext: async () => ({ profile: { id: 1 } }) }));

const input = { op: "directory", page: 1, search: "", companyId: 8, branchId: 9, departmentId: null,
  designationId: null, siteId: null, status: null } as const;
const digest = "a".repeat(64);
const identity = (id: number) => ({ id, employee_code: `M-${id}`, full_name_en: `Employee ${id}`, employee_status: "active",
  owner_company: "Company", branch: "Branch", department: null, designation: null, manager: null, site: null,
  workspace_revision: "7", own: false, contacts: id % 2 ? null : { mobile_number: "000000", personal_email: "private@example.invalid",
    emergency_contact_name: null, emergency_contact_mobile: null } });
const photoState = (id: number, count: number) => ({ documentId: id <= count ? 100 + id : null, framing: null, canDownload: false,
  photo: id <= count ? { document_id: 100 + id, version_id: 200 + id, file_id: 300 + id, label: `Photo ${id}` } : null });

function fixture(count = 0, mode?: "wrong-order" | "short" | "denied" | "unavailable" | "photo-unavailable" | "photo-aborted", size = 26) {
  const calls: string[] = [];
  const effects: unknown[][] = [];
  const signals: Array<[string, AbortSignal]> = [];
  const ids = Array.from({ length: size }, (_, i) => i + 1);
  async function rpcReply(name: string, args: { p_employee?: number; p_employees?: number[] }) {
      calls.push(name);
      if (name === "mobile_hr_profile") return { data: identity(args.p_employee!) };
      if (name === "hr_subject_photo_state" && mode === "photo-aborted") throw new DOMException("Read cancelled", "AbortError");
      if (name === "hr_subject_photo_state") return mode === "photo-unavailable" && args.p_employee === 1
        ? { data: null, error: { code: "503" } } : { data: photoState(args.p_employee!, count) };
      if (name !== "mobile_hr_v5_directory_details") throw Error(`Unexpected ${name}`);
      expect(args.p_employees).toEqual(ids.slice(0, 25));
      if (mode === "denied") return { data: null, error: { code: "42501" } };
      if (mode === "unavailable") return { data: null, error: { code: "503" } };
      const result = ids.slice(0, mode === "short" ? 24 : 25).map(id => {
        const record = identity(id);
        return { employeeId: id, employeeCode: record.employee_code, name: record.full_name_en, status: record.employee_status,
          company: record.owner_company, branch: record.branch, department: null, designation: null, site: null,
          phone: record.contacts?.mobile_number ?? null };
      });
      return { data: mode === "wrong-order" ? result.reverse() : result };
  }
  const db = {
    rpc(name: string, args: { p_employee?: number; p_employees?: number[] }) {
      const query = {
        abortSignal(signal: AbortSignal) { signals.push([name, signal]); return query; },
        then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) { return rpcReply(name, args).then(resolve, reject); },
      };
      return query;
    },
    from(table: string) {
      calls.push(table);
      let data: unknown;
      const query = {
        abortSignal(signal: AbortSignal) { signals.push([table, signal]); return query; },
        select(fields: string) { effects.push([table, "select", fields]); return query; },
        is(column: string, value: unknown) { effects.push([table, "is", column, value]); return query; },
        eq(column: string, value: unknown) { effects.push([table, "eq", column, value]); return query; },
        order: () => query,
        range(from: number, to: number) {
          effects.push([table, "range", from, to]);
          data = ids.map(id => ({ id, photo_dms_document_id: id <= count ? id + 100 : null }));
          return query;
        },
        then(resolve: (value: unknown) => unknown) { return Promise.resolve({ data }).then(resolve); },
        async maybeSingle() { return { data: { sha256_hash: digest } }; },
      };
      return query;
    },
  } as unknown as Db;
  createClient.mockReset().mockResolvedValue(db);
  return { db, calls, effects, signals };
}

describe("count-bounded mobile HR directory enrichment", () => {
  it.each([0, 5, 25])("bounds identity reads and preserves independent verification for %i selected photos", async count => {
    const { db, calls, effects } = fixture(count);
    const result = await directory(db, input);
    expect(calls.slice(0, 2)).toEqual(["employees", "mobile_hr_v5_directory_details"]);
    expect(calls.filter(call => call === "hr_subject_photo_state")).toHaveLength(count);
    expect(calls.filter(call => call === "dms_document_files")).toHaveLength(count);
    expect(calls).toHaveLength(2 + count * 2);
    expect(createClient).not.toHaveBeenCalled();
    expect(result).toMatchObject({ page: 1, pageSize: 25, more: true });
    expect(result.rows).toHaveLength(25);
    expect(result.rows[0]).toMatchObject({ employeeId: 1, phone: null, photo: photoBinding(1, null, photoState(1, count), digest) });
    expect(result.rows[1]).toMatchObject({ employeeId: 2, phone: "000000" });
    expect(result.rows.filter(row => "photo" in row && row.photo)).toHaveLength(count);
    expect(JSON.stringify(result)).not.toMatch(/private@example\.invalid|photo_dms_document_id/);
    expect(effects.filter(([table]) => table === "employees")).toEqual([["employees", "select", "id,photo_dms_document_id"], ["employees", "is", "deleted_at", null],
      ["employees", "eq", "owner_company_id", 8], ["employees", "eq", "branch_id", 9], ["employees", "range", 0, 25]]);
  });
  it("reports incomplete independent photos without suppressing authorized identities", async () => {
    const { db } = fixture(5, "photo-unavailable");
    const result = await directory(db, input);
    expect(result).toMatchObject({ more: true, photoReadIncomplete: true });
    expect(result.rows).toHaveLength(25);
    expect(result.rows[0]).toMatchObject({ employeeId: 1, photo: null });
    expect(result.rows.filter(row => "photo" in row && row.photo)).toHaveLength(4);
  });
  it("uses the HR POST request signal for only the authorized directory read transport", async () => {
    const { signals } = fixture(1);
    const { POST } = await import("@/app/api/mobile/hr/v1/route");
    const request = new Request("http://127.0.0.1:1/api/mobile/hr/v1", {
      method: "POST", body: JSON.stringify(input), signal: new AbortController().signal,
      headers: { Authorization: "Bearer synthetic.test.token", "Content-Type": "application/json" },
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(signals).toEqual(["employees", "mobile_hr_v5_directory_details", "hr_subject_photo_state", "dms_document_files"]
      .map(name => [name, request.signal]));
  });
  it("propagates cancellation instead of reporting a partial successful page", async () => {
    const { db } = fixture(1, "photo-aborted");
    await expect(directory(db, input)).rejects.toMatchObject({ name: "AbortError" });
  });
  it("skips enrichment when the scoped page is empty", async () => {
    const { db, calls } = fixture(0, undefined, 0);
    expect(await directory(db, input)).toEqual({ employeeId: null, page: 1, pageSize: 25, rows: [], more: false });
    expect(calls).toEqual(["employees"]);
  });
  it.each([["wrong-order", 503], ["short", 503], ["denied", 403], ["unavailable", 503]] as const)(
    "fails closed on %s enrichment", async (mode, status) => {
      const { db } = fixture(0, mode);
      await expect(directory(db, input)).rejects.toMatchObject({ status });
    });
});
