import {afterEach, expect, it, vi} from "vitest";
import {QueryClient, QueryObserver} from "@tanstack/react-query";
import {invalidateCommonMdDepartments, invalidateCommonMdDesignations} from "@/lib/query/invalidation";

const clients: QueryClient[] = [];
const reportKey = ["reports", "criteria", "synthetic-owner", "SYNTHETIC_REPORT", "department_id", "{}"];
const familyKeys = [reportKey, ["read", "employee-filter-departments", "{}"],
  ["read", "employee-filter-designations", "{}"], ["common_md", "departments"]];
function client() {
  const value = new QueryClient({defaultOptions: {queries: {retry: false, staleTime: Infinity}}});
  clients.push(value);return value;
}
afterEach(() => {vi.restoreAllMocks();clients.splice(0).forEach(value => value.clear());});

it.each(familyKeys.map((queryKey, index) => ({queryKey, index})))("awaits and reports an active dependent family $index read failure", async ({queryKey}) => {
  const q = client(), failure = new Error("Synthetic refresh failure"), read = vi.fn(async (): Promise<{revision: number}> => {throw failure;});
  q.setQueryData(queryKey, {revision: 1});
  const observer = new QueryObserver(q, {queryKey, queryFn: read, staleTime: Infinity}), stop = observer.subscribe(() => {});
  try {
    await expect(invalidateCommonMdDepartments(q)).rejects.toBe(failure);
    expect(read).toHaveBeenCalledTimes(1);
    expect(q.getQueryState(queryKey)?.status).toBe("error");
    expect(q.getQueryData(queryKey)).toEqual({revision: 1});
    read.mockImplementation(async () => ({revision: 2}));
    await expect(invalidateCommonMdDepartments(q)).resolves.toBeUndefined();
    expect(q.getQueryData(queryKey)).toEqual({revision: 2});
  } finally {stop();}
});

it.each(["mark-report", "cancel-report", "cancel-departments", "cancel-designations"])("reports a %s infrastructure failure without leaving dependent rejections unobserved", async target => {
  const q = client(), failure = new Error(`Synthetic ${target} failure`);
  const invalidate = q.invalidateQueries.bind(q), cancel = q.cancelQueries.bind(q);
  const invalidationSpy = vi.spyOn(q, "invalidateQueries").mockImplementation((filters, options) =>
    target === "mark-report" && filters?.queryKey?.[0] === "reports" && filters.refetchType === "none"
      ? Promise.reject(failure) : invalidate(filters, options));
  vi.spyOn(q, "cancelQueries").mockImplementation((filters, options) => {
    const family = filters?.queryKey;
    const matches = target === "cancel-report" ? family?.[0] === "reports"
      : target === "cancel-departments" ? family?.[1] === "employee-filter-departments"
      : target === "cancel-designations" && family?.[1] === "employee-filter-designations";
    return matches ? Promise.reject(failure) : cancel(filters, options);
  });
  await expect(invalidateCommonMdDepartments(q)).rejects.toBe(failure);
  expect(invalidationSpy.mock.calls.some(([filters]) => filters?.queryKey?.[0] === "common_md")).toBe(true);
  expect(invalidationSpy.mock.calls.some(([filters]) => filters?.queryKey?.[1] === "employee-filter-departments")).toBe(true);
  expect(invalidationSpy.mock.calls.some(([filters]) => filters?.queryKey?.[1] === "employee-filter-designations")).toBe(true);
});

it("does not settle a failed refresh while another required family is still pending", async () => {
  const q = client(), failure = new Error("Synthetic mark failure"), invalidate = q.invalidateQueries.bind(q);
  let finish!: () => void;
  vi.spyOn(q, "invalidateQueries").mockImplementation((filters, options) => {
    if (filters?.queryKey?.[0] === "reports" && filters.refetchType === "none") return Promise.reject(failure);
    if (filters?.queryKey?.[0] === "common_md") return new Promise<void>(resolve => {finish = resolve;});
    return invalidate(filters, options);
  });
  let outcome = "pending";
  const pending = invalidateCommonMdDepartments(q);
  void pending.then(() => {outcome = "resolved";}, () => {outcome = "rejected";});
  await Promise.resolve();await Promise.resolve();await Promise.resolve();
  expect(outcome).toBe("pending");
  finish();
  await expect(pending).rejects.toBe(failure);
  expect(outcome).toBe("rejected");
});

it("keeps same-tick criterion refresh coalescing while awaited callers observe its completion", async () => {
  const q = client(), read = vi.fn(async () => ({revision: 2}));
  q.setQueryData(reportKey, {revision: 1});
  const observer = new QueryObserver(q, {queryKey: reportKey, queryFn: read, staleTime: Infinity}), stop = observer.subscribe(() => {});
  try {
    invalidateCommonMdDesignations(q);
    await Promise.all([invalidateCommonMdDepartments(q), invalidateCommonMdDepartments(q)]);
    expect(read).toHaveBeenCalledTimes(1);
    expect(q.getQueryData(reportKey)).toEqual({revision: 2});
  } finally {stop();}
});

it("observes background infrastructure failures once without exposing error details", async () => {
  const q = client(), invalidate = q.invalidateQueries.bind(q), warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(q, "invalidateQueries").mockImplementation((filters, options) => filters?.queryKey?.[0] === "reports"
    ? Promise.reject(new Error("Sensitive synthetic backend detail")) : invalidate(filters, options));
  expect(invalidateCommonMdDesignations(q)).toBeUndefined();
  invalidateCommonMdDesignations(q);
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  expect(warning).toHaveBeenCalledTimes(1);
  expect(warning).toHaveBeenCalledWith("Report choices could not refresh. Reload before continuing.");
});

it("a background observer never swallows a coalesced checked refresh failure", async () => {
  const q = client(), failure = new Error("Sensitive synthetic backend detail"), warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  const queryKey = ["reports", "criteria", "synthetic-owner", "SYNTHETIC_REPORT", "designation_id", "{}"];
  q.setQueryData(queryKey, {revision: 1});
  const read = vi.fn(async () => {throw failure;});
  const observer = new QueryObserver(q, {queryKey, queryFn: read, staleTime: Infinity}), stop = observer.subscribe(() => {});
  try {
    invalidateCommonMdDesignations(q);
    await expect(invalidateCommonMdDepartments(q)).rejects.toBe(failure);
    expect(read).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledTimes(1);
    expect(warning).not.toHaveBeenCalledWith(failure);
  } finally {stop();}
});
