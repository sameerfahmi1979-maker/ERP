import {afterEach, expect, it, vi} from "vitest";
import {QueryClient, QueryObserver} from "@tanstack/react-query";
import * as changes from "@/lib/query/invalidation";
import {HR_SEARCH_CATEGORY_ORDER, type HrSearchCategory} from "@/lib/hr/search/types";

const clients: QueryClient[] = [];
const settle = () => new Promise<void>(done => setTimeout(done, 0));
function client() {const q = new QueryClient({defaultOptions: {queries: {retry: false, staleTime: Infinity}}}); clients.push(q); return q;}
function key(categories: HrSearchCategory[] = [], mode = "results", owner = "current", page = 1) {
  return ["hr", "search", mode, owner, JSON.stringify({mode, categories, page, pageSize: 50, query: "Synthetic"})];
}
afterEach(() => clients.splice(0).forEach(q => q.clear()));
const employeeCategories: HrSearchCategory[] = ["employees", "compliance", "time", "payroll", "operations", "actions"];
const candidateCategories: HrSearchCategory[] = ["candidates", "onboarding"];
const bindings: [string, (q: QueryClient) => void, HrSearchCategory[], boolean][] = [
  ["employees", changes.invalidateHrEmployees, employeeCategories, true],
  ["employee", q => changes.invalidateHrEmployee(q, 1), employeeCategories, true],
  ["employee status", q => changes.invalidateHrEmployeeStatusHistory(q, 1), employeeCategories, true],
  ["recruitment", changes.invalidateHrRecruitment, candidateCategories, true],
  ["candidates", changes.invalidateHrCandidates, candidateCategories, true],
  ["candidate", q => changes.invalidateHrCandidate(q, 1), candidateCategories, true],
  ["compliance", q => changes.invalidateHrEmployeeCompliance(q, 1), ["compliance"], false],
  ["identity", q => changes.invalidateHrEmployeeIdentityDocuments(q, 1), ["compliance"], false],
  ["access cards", q => changes.invalidateHrEmployeeAccessCards(q, 1), ["compliance"], false],
  ["training", q => changes.invalidateHrEmployeeTrainingCertificates(q, 1), ["compliance"], false],
  ["medical", q => changes.invalidateHrEmployeeMedicalRecords(q, 1), ["compliance"], false],
  ["employee time", q => changes.invalidateHrEmployeeTime(q, 1), ["time"], false],
  ["leave", q => changes.invalidateHrEmployeeLeave(q, 1), ["time"], false],
  ["global leave", changes.invalidateHrGlobalLeaveRequests, ["time"], false],
  ["leave type label", changes.invalidateHrLeaveTypes, ["time"], false],
  ["shared HR settings", changes.invalidateHrSettings, ["time"], false],
  ["employee payroll", q => changes.invalidateHrEmployeePayroll(q, 1), ["payroll"], false],
  ["holds", q => changes.invalidateHrEmployeePayrollHolds(q, 1), ["payroll"], false],
  ["WPS", q => changes.invalidateHrEmployeeWps(q, 1), ["payroll"], false],
  ["global payroll", changes.invalidateHrGlobalPayroll, ["payroll"], false],
  ["global WPS", changes.invalidateHrGlobalWpsReadiness, ["payroll"], false],
  ["employee operations", q => changes.invalidateHrEmployeeOperations(q, 1), ["operations"], false],
  ["assignment", q => changes.invalidateHrEmployeeAssignments(q, 1), ["operations"], false],
  ["global assignments", changes.invalidateHrGlobalAssignments, ["operations"], false],
  ["block", q => changes.invalidateHrEmployeeBlocks(q, 1), ["operations"], false],
  ["global blocks", changes.invalidateHrGlobalBlocks, ["operations"], false],
  ["work site label", changes.invalidateCommonMdWorkSites, ["operations"], false],
  ["employee actions", q => changes.invalidateHrEmployeeActions(q, 1), ["actions"], false],
  ["PRO", q => changes.invalidateHrEmployeeProProcesses(q, 1), ["actions"], false],
  ["global PRO", changes.invalidateHrGlobalProProcesses, ["actions"], false],
  ["HR action", q => changes.invalidateHrEmployeeHrActions(q, 1), ["actions"], false],
  ["disciplinary", q => changes.invalidateHrEmployeeDisciplinary(q, 1), ["actions"], false],
  ["global disciplinary", changes.invalidateHrGlobalDisciplinary, ["actions"], false],
  ["EOS", q => changes.invalidateHrEmployeeEos(q, 1), ["actions"], false],
  ["global EOS", changes.invalidateHrGlobalEos, ["actions"], false],
  ["candidate onboarding", q => changes.invalidateHrCandidateOnboarding(q, 1), ["onboarding"], false],
  ["employee onboarding", q => changes.invalidateHrEmployeeOnboarding(q, 1), ["onboarding"], false],
  ["global onboarding", changes.invalidateHrGlobalOnboarding, ["onboarding"], false],
];
it.each(bindings)("%s refreshes only dependent search categories and preserves draft state", async (_label, change, expected, suggestions) => {
  const q = client(), draft = ["workspace", "draft", 1];
  const categorySets = [[], ...HR_SEARCH_CATEGORY_ORDER.map(c => [c]), ["employees", "candidates"]] as HrSearchCategory[][];
  for (const categories of categorySets) for (const owner of ["current", "retired"]) for (const page of [1, 2]) q.setQueryData(key(categories, "results", owner, page), {revision: 1});
  q.setQueryData(key([], "suggestions"), {revision: 1}); q.setQueryData(draft, {notes: "Keep me"}); change(q); await settle();
  for (const categories of categorySets) for (const owner of ["current", "retired"]) for (const page of [1, 2]) {
    expect(q.getQueryState(key(categories, "results", owner, page))?.isInvalidated).toBe(!categories.length || categories.some(c => expected.includes(c)));
  }
  expect(q.getQueryState(key([], "suggestions"))?.isInvalidated).toBe(suggestions);
  expect(q.getQueryState(draft)?.isInvalidated).toBe(false); expect(q.getQueryData(draft)).toEqual({notes: "Keep me"});
});
it("coalesces overlapping confirmed writes and refreshes again for a later write", async () => {
  const q = client(), queryKey = key(), read = vi.fn(async () => ({revision: 2})); q.setQueryData(queryKey, {revision: 1});
  const observer = new QueryObserver(q, {queryKey, queryFn: read}), stop = observer.subscribe(() => {});
  try {changes.invalidateHrEmployee(q, 1); changes.invalidateHrEmployees(q); changes.invalidateHrCandidate(q, 2); await settle();
    expect(read).toHaveBeenCalledTimes(1); changes.invalidateHrEmployee(q, 1); await settle(); expect(read).toHaveBeenCalledTimes(2);
  } finally {stop();}
});
it.each(["results", "suggestions"])("cancels a pre-write initial %s request before refreshing", async mode => {
  const q = client(), queryKey = key([], mode); let signal!: AbortSignal, finish!: () => void, revision = 1;
  const read = vi.fn(({signal: s}: {signal: AbortSignal}) => revision === 1 ? new Promise(resolve => {signal = s; finish = () => resolve({revision: 1});}) : Promise.resolve({revision}));
  const observer = new QueryObserver(q, {queryKey, queryFn: read}), stop = observer.subscribe(() => {});
  try {revision = 2; changes.invalidateHrEmployee(q, 1); await settle(); expect(signal.aborted).toBe(true); finish(); await settle();
    expect(read).toHaveBeenCalledTimes(2); expect(q.getQueryData(queryKey)).toEqual({revision: 2});
  } finally {stop();}
});
it("retires observerless queries without refetching retired owners", async () => {
  const q = client(), queryKey = key([], "results", "retired"); let signal!: AbortSignal, finish!: () => void;
  const read = vi.fn(({signal: s}: {signal: AbortSignal}) => new Promise(resolve => {signal = s; finish = () => resolve({revision: 1});}));
  const pending = q.fetchQuery({queryKey, queryFn: read}).catch(() => null); changes.invalidateHrCandidate(q, 1); await settle();
  expect(signal.aborted).toBe(true); finish(); await pending; await settle(); expect(read).toHaveBeenCalledTimes(1); expect(q.getQueryData(queryKey)).toBeUndefined();
});
it("does not refresh search for unrelated salary amounts, attendance or interview details", async () => {
  const q = client(), queryKey = key(), suggestionKey = key([], "suggestions"); q.setQueryData(queryKey, 1); q.setQueryData(suggestionKey, 1);
  changes.invalidateHrEmployeeSalaryComponents(q, 1); changes.invalidateHrEmployeeAttendance(q, 1); changes.invalidateHrCandidateInterviews(q, 1);
  await settle(); expect(q.getQueryState(queryKey)?.isInvalidated).toBe(false); expect(q.getQueryState(suggestionKey)?.isInvalidated).toBe(false);
});
