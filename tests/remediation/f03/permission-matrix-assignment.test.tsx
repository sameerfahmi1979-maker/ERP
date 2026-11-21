// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ColumnDef } from "@tanstack/react-table";
import type { Permission, Role } from "@/types/domain";

const state = vi.hoisted(() => ({ draft: "[]", clear: vi.fn(), write: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/server/actions/permissions", () => ({ saveRolePermissionDraftChanges: vi.fn() }));
vi.mock("@/components/workspace/workspace-provider", () => ({ useWorkspaceContext: () => null }));
vi.mock("@/hooks/use-workspace-tab-dirty", () => ({ useWorkspaceTabDirty: vi.fn() }));
vi.mock("@/hooks/use-workspace-form-draft", () => ({
  useWorkspaceFormDraft: () => ({
    getDraftDefault: () => state.draft,
    writeDraftField: state.write,
    clearDraft: state.clear,
  }),
}));
vi.mock("@/features/permissions/permission-explorer", () => ({
  PermissionExplorer: ({ permissions, onSelect }: {
    permissions: Permission[];
    onSelect: (permission: Permission) => void;
  }) => <button type="button" onClick={() => onSelect(permissions[0])}>Select permission</button>,
}));
vi.mock("@/components/erp/table/erp-data-table", () => ({
  ERPDataTable: ({ columns, data }: { columns: ColumnDef<Role>[]; data: Role[] }) => (
    <div role="group" aria-label="Role assignments">
      {data.map((role) => (
        <div key={role.id}>
          {columns.map((column) => (
            <div key={column.id}>
              {typeof column.cell === "function" && column.cell(
                { row: { original: role } } as Parameters<typeof column.cell>[0],
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  ),
}));

import { PermissionCommandCenter } from "@/features/permissions/permission-command-center";

const permission = {
  id: 51, permission_code: "fleet.assets.manage", permission_name: "Maintain Fleet assets",
  module_code: "fleet", action_code: "manage", is_system_permission: true, is_visible: true,
} as Permission;
const role = {
  id: 6, role_name: "Fleet Manager", role_code: "fleet_manager", active: true, is_system_role: true,
} as Role;
const draft = {
  permissionId: permission.id, permissionCode: permission.permission_code, permissionName: permission.permission_name,
  roleId: role.id, roleCode: role.role_code, roleName: role.role_name, action: "grant", originalAssigned: false,
  permissionIsSystem: true, roleIsSystem: true,
};

afterEach(() => {
  cleanup();
  state.draft = "[]";
  vi.clearAllMocks();
});

function showAssignment(assigned: boolean) {
  state.draft = JSON.stringify([draft]);
  render(
    <PermissionCommandCenter
      permissions={[permission]}
      roles={[role]}
      rolePermissions={assigned ? [{ role_id: role.id, permission_id: permission.id }] : []}
      canManage
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Select permission" }));
  return screen.getByRole("switch");
}

it("shows a saved grant in green and clears the corresponding restored draft", () => {
  const toggle = showAssignment(true);
  expect(toggle.getAttribute("aria-checked")).toBe("true");
  expect(toggle.hasAttribute("data-checked")).toBe(true);
  expect(toggle.classList.contains("data-checked:bg-emerald-600")).toBe(true);
  expect(within(screen.getByRole("group", { name: "Role assignments" })).getByText("Assigned")).toBeDefined();
  expect(screen.queryByText("Pending Grant")).toBeNull();
  expect(state.clear).toHaveBeenCalled();
});

it("retains an unsaved grant for review and displays it in blue", () => {
  const toggle = showAssignment(false);
  expect(toggle.getAttribute("aria-checked")).toBe("true");
  expect(toggle.classList.contains("data-checked:bg-blue-600")).toBe(true);
  expect(screen.getByText("Pending Grant")).toBeDefined();
  expect(state.write).toHaveBeenCalledWith("permission_changes", JSON.stringify([draft]));
});
