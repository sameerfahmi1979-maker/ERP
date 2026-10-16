import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { DepartmentWorkspaceForm } from "@/features/common-master-data/departments/department-workspace-form";
import {readDepartmentScopeCatalogue} from '@/server/department-scope-catalogue';
import {LoadError} from '@/components/erp/load-error';

export default async function NewDepartmentPage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "common_md.manage") && !hasPermission(ctx, "common_md.departments.manage")) {
    redirect("/admin/common-master-data/departments");
  }
  const scope=await readDepartmentScopeCatalogue();
  if(!scope.success)return <LoadError title="Department organizations and branches" retryHref="/admin/common-master-data/departments/record/new"/>;
  return <DepartmentWorkspaceForm mode="add" authContext={ctx} companies={scope.data.companies.filter(c=>c.status==='active')} branches={scope.data.branches} />;
}
