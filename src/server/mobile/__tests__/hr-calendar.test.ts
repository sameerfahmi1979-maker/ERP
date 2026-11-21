import { expect, it, vi } from "vitest";
import { teamCalendar } from "../hr-calendar";
import type { Db } from "../hr-reads";

it("keeps the mapped leave history ID on a managed calendar row and trims only the lookahead", async () => {
  const row = { id: 82001, employeeId: 12, employeeLabel: "Employee 12", startDate: "2026-11-19",
    endDate: "2026-11-23", status: "pending", label: "Annual leave" };
  const rows = Array.from({length: 26}, (_, index) => ({...row, id: row.id + index}));
  const rpc = vi.fn().mockResolvedValue({ data: rows, error: null });
  const page = await teamCalendar({rpc} as unknown as Db, {op: "teamCalendar", from: "2026-11-20",
    to: "2026-11-21", page: 1, companyId: 1, branchId: 4, employeeId: 12, search: "Employee"});
  expect(rpc).toHaveBeenCalledWith("mobile_hr_v5_calendar", {
    p_from: "2026-11-20", p_to: "2026-11-21", p_page: 1, p_company: 1, p_branch: 4, p_employee: 12, p_search: "Employee",
  });
  expect(page).toEqual({employeeId: 12, page: 1, pageSize: 25, more: true, rows: rows.slice(0, 25)});
});
