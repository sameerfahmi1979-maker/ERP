import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ choices: vi.fn(), records: vi.fn() }));
vi.mock("@/server/reads/read-context", () => ({ getReadAuthContext: async () => ({
 profile: { id: 1, auth_user_id: "synthetic", must_change_password: false },
 isAccountActive: true, permissionCodes: ["dms.documents.view"], roleAssignments: [], roleCodes: [],
}) }));
vi.mock("@/lib/rbac/check", async () => await import("@/lib/rbac/scope"));
vi.mock("@/server/reads/dms-documents", () => ({ readDmsDocumentPage: state.records }));
vi.mock("@/server/reads/dms-list-choices", () => ({ readDmsListChoices: state.choices }));
vi.mock("@/features/dms/documents/dms-documents-table", () => ({ DmsDocumentsTable: ({initialTotal}: {initialTotal:number}) => <p>{initialTotal} permitted records</p> }));
vi.mock("@/features/dms/documents/dms-lifecycle-navigation", () => ({ DmsLifecycleNavigation: () => null }));
vi.mock("@/components/erp/page-header", () => ({ ERPPageHeader: ({title}: {title:string}) => <h1>{title}</h1> }));
vi.mock("@/features/dms/documents/dms-load-error", () => ({ DmsLoadError: () => <p>Document list unavailable</p> }));
import Page from "@/app/(protected)/dms/documents/page";

it("renders the healthy counted document list without waiting for the taxonomy", async () => {
 state.choices.mockResolvedValue({ success: false });
 state.records.mockResolvedValue({ success: true, data: { rows: [{ id: 1 }], totalCount: 1, page: 1, pageSize: 25, updatedAt: Date.now() } });
 const page = renderToStaticMarkup(await Page());
 expect(page).toContain("1 permitted records");
 expect(page).not.toContain("Document list unavailable");
 expect(state.choices).not.toHaveBeenCalled();
});
