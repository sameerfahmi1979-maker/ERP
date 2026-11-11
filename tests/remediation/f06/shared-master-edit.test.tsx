// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ERPRecordWorkspaceFormProps } from "@/components/workspace/erp-record-workspace-form";
import type { AuthContext } from "@/lib/rbac/check";
import type { DesignationRow } from "@/server/actions/common-master-data/designations";
import type { ApprovalRoleRow } from "@/server/actions/common-master-data/approval-roles";
import type { DmsRequiredDocumentRuleRow } from "@/server/actions/common-master-data/dms-required-document-rules";
import { DesignationWorkspaceForm } from "@/features/common-master-data/designations/designation-workspace-form";
import { ApprovalRoleWorkspaceForm } from "@/features/common-master-data/approval-roles/approval-role-workspace-form";
import { DmsRequiredDocumentRuleForm } from "@/features/common-master-data/dms-required-document-rules/dms-required-document-rule-form";

const mock = vi.hoisted(() => ({ save: vi.fn(), onSave: undefined as ERPRecordWorkspaceFormProps["onSave"] }));
vi.mock("@/hooks/use-workspace-form-navigation", () => ({ useWorkspaceFormNavigation: () => ({ markDirty: vi.fn() }) }));
vi.mock("@/hooks/use-workspace-form-section", () => ({ useWorkspaceFormSection: () => ["basic", vi.fn()] }));
vi.mock("@/hooks/use-workspace-form-dirty", () => ({ useWorkspaceFormDirty: () => ({ isDirty: false, resetDirty: vi.fn() }) }));
vi.mock("@/hooks/use-workspace-form-draft", () => ({ useWorkspaceFormDraft: () => ({ getDraftDefault: (_: string, value: unknown) => value, clearDraft: vi.fn() }) }));
vi.mock("@/server/actions/common-master-data/designations", () => ({ createDesignation: mock.save, updateDesignation: mock.save }));
vi.mock("@/server/actions/common-master-data/approval-roles", () => ({ createApprovalRole: mock.save, updateApprovalRole: mock.save }));
vi.mock("@/server/actions/common-master-data/dms-required-document-rules", () => ({ createDmsRequiredDocumentRule: mock.save, updateDmsRequiredDocumentRule: mock.save }));
vi.mock("@/components/workspace/erp-record-workspace-form", () => ({
  ERPRecordWorkspaceForm: ({ onSave, headerActions, children }: ERPRecordWorkspaceFormProps) => {
    mock.onSave = onSave;
    return <div>{headerActions}{children}</div>;
  },
  ERPRecordSectionPanel: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
}));

const admin: AuthContext = {
  profile: { id: 1 } as AuthContext["profile"], email: null, accountStatus: "active", isAccountActive: true,
  roleCodes: ["system_admin"], permissionCodes: [],
  roleAssignments: [{ roleId: 1, roleCode: "system_admin", ownerCompanyId: null, branchId: null, permissionCodes: [] }],
};
const companies = [{ id: 1, company_code: "ALGT", legal_name_en: "ALGT" }];
const cases = [
  { route: "designations", checkbox: "Active", expected: { is_active: false },
    mount: (mode: "view" | "edit") => <DesignationWorkspaceForm mode={mode} authContext={admin} companies={companies}
      designation={{ id: 71, designation_code: "SYN", designation_name_en: "Synthetic", owner_company_id: 1, is_active: true } as DesignationRow} /> },
  { route: "approval-roles", checkbox: "Can Approve", expected: { can_approve: false },
    mount: (mode: "view" | "edit") => <ApprovalRoleWorkspaceForm mode={mode} authContext={admin} companies={companies}
      role={{ id: 71, role_code: "SYN", role_name: "Synthetic", level_number: 1, owner_company_id: 1, can_approve: true } as ApprovalRoleRow} /> },
  { route: "dms-required-documents", checkbox: "Is Required", expected: { is_required: false },
    mount: (mode: "view" | "edit") => <DmsRequiredDocumentRuleForm mode={mode} authContext={admin} companies={companies}
      rule={{ id: 71, rule_code: "SYN", rule_name: "Synthetic", entity_type: "company", owner_company_id: 1, is_required: true } as DmsRequiredDocumentRuleRow} /> },
];

beforeEach(() => mock.save.mockReset().mockResolvedValue({ success: true }));
afterEach(cleanup);

it.each(cases)("$route has an Edit link and saves All Organizations and cleared flags", async ({ route, checkbox, expected, mount }) => {
  const view = render(mount("view"));
  expect(screen.getByRole("link", { name: "Edit" }).getAttribute("href")).toBe(`/admin/common-master-data/${route}/record/71?mode=edit`);
  view.unmount();
  render(mount("edit"));
  fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "" } });
  fireEvent.click(screen.getByRole("checkbox", { name: checkbox }));
  await act(async () => { expect(await mock.onSave?.()).toBe(true); });
  expect(mock.save).toHaveBeenCalledWith(expect.objectContaining({ id: 71, owner_company_id: null, ...expected }));
});
