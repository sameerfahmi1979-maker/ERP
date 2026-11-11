import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect, notFound } from "next/navigation";
import { getDepartmentById } from "@/server/actions/common-master-data/departments";
import { DepartmentWorkspaceForm } from "@/features/common-master-data/departments/department-workspace-form";
import {readDepartmentScopeCatalogue} from '@/server/department-scope-catalogue';
import {LoadError} from '@/components/erp/load-error';
import {canManageDepartment} from '@/lib/master-data/department-permissions';

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ mode?: string }> };

export default async function DepartmentRecordPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { mode: modeParam } = await searchParams;
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "common_md.view") && !hasPermission(ctx, "common_md.departments.view")) {
    redirect("/admin/common-master-data/departments");
  }
  const numericId = Number(id);
  if (!/^[1-9]\d*$/.test(id)||!Number.isSafeInteger(numericId)) notFound();
  const retryHref = `/admin/common-master-data/departments/record/${numericId}${modeParam === "edit" ? "?mode=edit" : ""}`;
  const result = await getDepartmentById(numericId);
  if (!result.success) {
    if(result.kind==='not_found'||result.kind==='invalid_input')notFound();
    return <LoadError title="Department" retryHref={retryHref}/>;
  }
  const department = result.data;
  if(!department)notFound();
  const canManage = canManageDepartment(ctx, department.owner_company_id, department.branch_id);
  const mode = modeParam === "edit" && canManage ? "edit" : "view";
  const scope=await readDepartmentScopeCatalogue();
  if(!scope.success)return <LoadError title="Department organizations and branches" retryHref={retryHref}/>;
  const company=scope.data.companies.find(c=>c.id===department.owner_company_id),branch=scope.data.branches.find(b=>b.id===department.branch_id);
  return <DepartmentWorkspaceForm department={{...department,owner_company:company??department.owner_company,branch:branch??department.branch}} mode={mode} authContext={ctx} companies={scope.data.companies.filter(c=>c.status==='active'||c.id===department.owner_company_id)} branches={scope.data.branches} />;
}
