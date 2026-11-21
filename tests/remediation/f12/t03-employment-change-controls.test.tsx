// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { AuthContext } from "@/lib/rbac/check";
import { EmployeeEmploymentChangeRequest } from "@/features/hr/employees/employment-change-controls";

const mocks = vi.hoisted(() => ({ propose: vi.fn() }));
vi.mock("@/server/actions/hr/employment-lifecycle", () => ({
  proposeEmploymentChange: mocks.propose,
  decideEmploymentChange: vi.fn(),
  readEmploymentChange: vi.fn(),
}));
vi.mock("@/hooks/use-read-lifetime", () => ({
  useReadLifetime: () => ({ active: true, enabled: true }),
}));
vi.mock("@/components/erp/organizations/owner-company-select", () => ({
  OwnerCompanySelect: ({ value, onValueChange }: { value: number | null; onValueChange: (value: number) => void }) => (
    <select aria-label="Receiving employer" value={value ?? ""} onChange={event => onValueChange(Number(event.target.value))}>
      <option value="" /><option value="10">Current employer</option><option value="11">New employer</option>
    </select>
  ),
}));
vi.mock("@/components/erp/organizations/branch-select", () => ({
  BranchSelect: ({ value, onValueChange }: { value: number | null; onValueChange: (value: number) => void }) => (
    <select aria-label="Receiving branch" value={value ?? ""} onChange={event => onValueChange(Number(event.target.value))}>
      <option value="" /><option value="22">Another branch</option>
    </select>
  ),
}));
const permission = "hr.employment.lifecycle.manage";
const auth = {
  isAccountActive: true, profile: { id: 1, auth_user_id: "synthetic", must_change_password: false },
  roleCodes: ["hr"], globalPermissionCodes: [], permissionCodes: [permission],
  roleAssignments: [{ roleCode: "hr", ownerCompanyId: 10, branchId: 21, permissionCodes: [permission] }],
} as unknown as AuthContext;

afterEach(() => { cleanup(); mocks.propose.mockReset(); });

it("preserves service dates for a branch move and retries the exact original request", async () => {
  mocks.propose.mockResolvedValueOnce({ error: "Outcome unconfirmed", uncertain: true })
    .mockResolvedValueOnce({ data: { id: 52, digest: "a".repeat(64), status: "proposed", replayed: true } });
  const outerSave = vi.fn(event => event.preventDefault());
  render(<form onSubmit={outerSave}><EmployeeEmploymentChangeRequest employee={5} revision={8} company={10} branch={21} authContext={auth} /></form>);
  fireEvent.click(screen.getByText("Prepare an employment change"));
  fireEvent.change(screen.getByLabelText("Effective date"), { target: { value: "2026-11-18" } });
  fireEvent.change(screen.getByLabelText("Receiving employer"), { target: { value: "10" } });
  fireEvent.change(screen.getByLabelText("Receiving branch"), { target: { value: "22" } });
  expect(screen.queryByLabelText("Contractual start")).toBeNull();
  fireEvent.change(screen.getByLabelText("Change reason"), { target: { value: "Approved local move" } });
  fireEvent.click(screen.getByRole("button", { name: "Prepare for review" }));
  await screen.findByText("Outcome unconfirmed");
  expect(mocks.propose.mock.calls[0][0]).toMatchObject({ employee: 5, revision: 8, company: 10, branch: 22, contractualStart: null });
  expect((screen.getByLabelText("Change reason") as HTMLTextAreaElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Retry original request" }));
  await waitFor(() => expect(mocks.propose.mock.calls[1][0]).toEqual(mocks.propose.mock.calls[0][0]));
  await screen.findByText(/Employment change #52/);
  expect(outerSave).not.toHaveBeenCalled();
});
