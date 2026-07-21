"use server";

import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";
import { z } from "zod";

// ============================================================================
// Shared result type
// ============================================================================

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

// ============================================================================
// Row types
// ============================================================================

export type EmployeeRow = {
  id: number;
  employee_code: string;
  // Personal
  full_name_en: string;
  full_name_ar: string | null;
  known_name: string | null;
  gender: "male" | "female";
  nationality_id: number | null;
  date_of_birth: string;
  marital_status: string | null;
  mobile_number: string;
  personal_email: string | null;
  uae_address: string | null;
  home_country_address: string | null;
  blood_group: string | null;
  photo_dms_document_id: number | null;
  // Employment
  owner_company_id: number;
  branch_id: number | null;
  department_id: number | null;
  designation_id: number | null;
  employee_category_id: number | null;
  employment_type_id: number | null;
  joining_date: string;
  actual_joining_date: string | null;
  employee_status: string;
  reporting_manager_id: number | null;
  supervisor_id: number | null;
  primary_work_site_id: number | null;
  sponsor_company_id: number | null;
  mohre_establishment_id: number | null;
  // Contract
  probation_start_date: string | null;
  probation_end_date: string | null;
  contract_type: string | null;
  contract_start_date: string | null;
  contract_end_date: string | null;
  notice_period_days: number | null;
  // Status extras
  inactive_date: string | null;
  inactive_reason: string | null;
  // Emergency
  emergency_contact_name: string;
  emergency_contact_mobile: string;
  emergency_contact_relationship_type_id: number | null;
  // Metadata
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
  deleted_at: string | null;
  deleted_by: number | null;
};

export type EmployeeListRow = EmployeeRow & {
  nationality?: { id: number; name_en: string } | null;
  owner_company?: { id: number; legal_name_en: string; company_code: string } | null;
  branch?: { id: number; branch_name_en: string; branch_code: string } | null;
  department?: { id: number; department_name_en: string } | null;
  designation?: { id: number; designation_name_en: string } | null;
  employee_category?: { id: number; name_en: string } | null;
  employment_type?: { id: number; name_en: string } | null;
  primary_work_site?: { id: number; site_name: string } | null;
  mohre_establishment?: {
    id: number;
    establishment_name: string;
    establishment_number: string;
  } | null;
};

export type EmployeeStatusEvent = {
  id: number;
  employee_id: number;
  old_status: string | null;
  new_status: string;
  reason: string | null;
  effective_date: string | null;
  created_at: string;
  created_by: number | null;
};

// ============================================================================
// Zod Schemas
// ============================================================================

const employeeCreateSchema = z.object({
  full_name_en: z.string().min(1, "Full name (English) is required"),
  full_name_ar: z.string().nullish(),
  known_name: z.string().nullish(),
  gender: z.enum(["male", "female"]),
  nationality_id: z.number().int().positive().nullish(),
  date_of_birth: z.string().min(1, "Date of birth is required"),
  marital_status: z.enum(["single", "married", "divorced", "widowed"]).nullish(),
  mobile_number: z.string().min(1, "Mobile number is required"),
  personal_email: z.string().email("Invalid email").nullish().or(z.literal("").transform(() => null)),
  uae_address: z.string().nullish(),
  home_country_address: z.string().nullish(),
  blood_group: z.enum(["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"]).nullish(),
  photo_dms_document_id: z.number().int().positive().nullish(),
  // Employment
  owner_company_id: z.number().int().positive({ message: "Employer company is required" }),
  branch_id: z.number().int().positive().nullish(),
  department_id: z.number().int().positive().nullish(),
  designation_id: z.number().int().positive().nullish(),
  employee_category_id: z.number().int().positive({ message: "Employee Category is required" }),
  employment_type_id: z.number().int().positive().nullish(),
  joining_date: z.string().min(1, "Joining date is required"),
  actual_joining_date: z.string().nullish(),
  employee_status: z.enum(["active", "inactive", "on_leave", "probation", "suspended", "terminated", "archived"]).default("active"),
  reporting_manager_id: z.number().int().positive().nullish(),
  supervisor_id: z.number().int().positive().nullish(),
  primary_work_site_id: z.number().int().positive().nullish(),
  sponsor_company_id: z.number().int().positive().nullish(),
  mohre_establishment_id: z.number().int().positive().nullish(),
  // Contract
  probation_start_date: z.string().nullish(),
  probation_end_date: z.string().nullish(),
  contract_type: z.enum(["limited", "unlimited"]).nullish(),
  contract_start_date: z.string().nullish(),
  contract_end_date: z.string().nullish(),
  notice_period_days: z.number().int().min(0).nullish(),
  // Emergency
  emergency_contact_name: z.string().min(1, "Emergency contact name is required"),
  emergency_contact_mobile: z.string().min(1, "Emergency contact mobile is required"),
  emergency_contact_relationship_type_id: z.number().int().positive().nullish(),
});

const employeeUpdateSchema = employeeCreateSchema.partial().extend({
  employee_category_id: z.number().int().positive().nullish(),
  inactive_date: z.string().nullish(),
  inactive_reason: z.string().nullish(),
});

const employeeListParamsSchema = z.object({
  search: z.string().optional(),
  ownerCompanyId: z.number().int().positive().optional(),
  branchId: z.number().int().positive().optional(),
  departmentId: z.number().int().positive().optional(),
  designationId: z.number().int().positive().optional(),
  employeeCategoryId: z.number().int().positive().optional(),
  employmentTypeId: z.number().int().positive().optional(),
  employeeStatus: z.string().optional(),
  nationalityId: z.number().int().positive().optional(),
  primaryWorkSiteId: z.number().int().positive().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(50),
});

export type EmployeeCreateInput = z.infer<typeof employeeCreateSchema>;
export type EmployeeUpdateInput = z.infer<typeof employeeUpdateSchema>;
export type EmployeeListParams = z.infer<typeof employeeListParamsSchema>;

// ============================================================================
// listEmployees
// ============================================================================

export async function listEmployees(params?: Partial<EmployeeListParams>): Promise<
  ActionResult<{ rows: EmployeeListRow[]; totalCount: number; page: number; pageSize: number }>
> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.employees.view") && !ctx.roleCodes?.includes("system_admin")) {
      return { success: false, error: "Permission denied" };
    }

    const parsed = employeeListParamsSchema.safeParse(params ?? {});
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
    }

    const {
      search,
      ownerCompanyId,
      branchId,
      departmentId,
      designationId,
      employeeCategoryId,
      employmentTypeId,
      employeeStatus,
      nationalityId,
      primaryWorkSiteId,
      page,
      pageSize,
    } = parsed.data;

    const supabase = await createClient();

    const JOINS = [
      "nationality:countries(id,name_en)",
      "owner_company:owner_companies!employees_owner_company_id_fkey(id,legal_name_en,company_code)",
      "branch:branches(id,branch_name_en,branch_code)",
      "department:departments(id,department_name_en)",
      "designation:designations(id,designation_name_en)",
      "employee_category:hr_employee_categories(id,name_en)",
      "employment_type:hr_employment_types(id,name_en)",
      "primary_work_site:work_sites(id,site_name)",
      "mohre_establishment:hr_mohre_establishments!employees_mohre_establishment_id_fkey(id,establishment_name,establishment_number)",
    ].join(",");

    let query = supabase
      .from("employees")
      .select(`*,${JOINS}`, { count: "exact" })
      .is("deleted_at", null);

    if (search) {
      query = query.or(
        `employee_code.ilike.%${search}%,full_name_en.ilike.%${search}%,full_name_ar.ilike.%${search}%,known_name.ilike.%${search}%,mobile_number.ilike.%${search}%,personal_email.ilike.%${search}%`
      );
    }
    if (ownerCompanyId) query = query.eq("owner_company_id", ownerCompanyId);
    if (branchId) query = query.eq("branch_id", branchId);
    if (departmentId) query = query.eq("department_id", departmentId);
    if (designationId) query = query.eq("designation_id", designationId);
    if (employeeCategoryId) query = query.eq("employee_category_id", employeeCategoryId);
    if (employmentTypeId) query = query.eq("employment_type_id", employmentTypeId);
    if (employeeStatus) query = query.eq("employee_status", employeeStatus);
    if (nationalityId) query = query.eq("nationality_id", nationalityId);
    if (primaryWorkSiteId) query = query.eq("primary_work_site_id", primaryWorkSiteId);

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await query
      .order("employee_code", { ascending: true })
      .range(from, to);

    if (error) {
      logger.error("listEmployees error", error);
      return { success: false, error: error.message };
    }

    return {
      success: true,
      data: {
        rows: (data ?? []) as unknown as EmployeeListRow[],
        totalCount: count ?? 0,
        page,
        pageSize,
      },
    };
  } catch (err) {
    logger.error("listEmployees exception", err);
    return { success: false, error: "Failed to list employees" };
  }
}

// ============================================================================
// getEmployee
// ============================================================================

export async function getEmployee(employeeId: number): Promise<ActionResult<EmployeeListRow>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.employees.view") && !ctx.roleCodes?.includes("system_admin")) {
      return { success: false, error: "Permission denied" };
    }

    const supabase = await createClient();

    const JOINS = [
      "nationality:countries(id,name_en)",
      "owner_company:owner_companies!employees_owner_company_id_fkey(id,legal_name_en,company_code)",
      "branch:branches(id,branch_name_en,branch_code)",
      "department:departments(id,department_name_en)",
      "designation:designations(id,designation_name_en)",
      "employee_category:hr_employee_categories(id,name_en)",
      "employment_type:hr_employment_types(id,name_en)",
      "primary_work_site:work_sites(id,site_name)",
      "mohre_establishment:hr_mohre_establishments!employees_mohre_establishment_id_fkey(id,establishment_name,establishment_number)",
    ].join(",");

    const { data, error } = await supabase
      .from("employees")
      .select(`*,${JOINS}`)
      .eq("id", employeeId)
      .is("deleted_at", null)
      .single();

    if (error) {
      logger.error("getEmployee error", error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data as unknown as EmployeeListRow };
  } catch (err) {
    logger.error("getEmployee exception", err);
    return { success: false, error: "Failed to get employee" };
  }
}

// ============================================================================
// getEmployeeOverview
// ============================================================================

export type EmployeeOverview = {
  employee: EmployeeListRow;
  statusHistory: EmployeeStatusEvent[];
};

export async function getEmployeeOverview(
  employeeId: number
): Promise<ActionResult<EmployeeOverview>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.employees.view") && !ctx.roleCodes?.includes("system_admin")) {
      return { success: false, error: "Permission denied" };
    }

    const [empResult, histResult] = await Promise.all([
      getEmployee(employeeId),
      getEmployeeStatusHistory(employeeId),
    ]);

    if (!empResult.success || !empResult.data) {
      return { success: false, error: empResult.error ?? "Employee not found" };
    }

    return {
      success: true,
      data: {
        employee: empResult.data,
        statusHistory: histResult.data ?? [],
      },
    };
  } catch (err) {
    logger.error("getEmployeeOverview exception", err);
    return { success: false, error: "Failed to get employee overview" };
  }
}

// ============================================================================
// createEmployee
// ============================================================================

export async function createEmployee(
  input: EmployeeCreateInput
): Promise<ActionResult<{ id: number; employee_code: string }>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.employees.create") && !ctx.roleCodes?.includes("system_admin")) {
      return { success: false, error: "Permission denied" };
    }

    const parsed = employeeCreateSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
    }

    const supabase = await createClient();

    // Step 1: Generate employee code using admin client (bypasses numbering permission)
    const adminClient = createAdminClient();
    const { data: numData, error: numError } = await adminClient.rpc(
      "generate_next_reference_number",
      {
        p_rule_code: "HR_EMPLOYEE",
        p_document_type_code: null,
        p_target_table_name: "employees",
        p_target_record_id: null,
        p_generation_reason: "New employee",
        p_generated_by: ctx.profile?.id ?? null,
      }
    );

    if (numError || !numData || numData.length === 0) {
      logger.error("Employee code generation error", numError);
      return { success: false, error: "Failed to generate employee code" };
    }

    const employeeCode: string = numData[0].generated_reference_number;

    // Step 2: Insert employee
    const { data: employee, error: insertError } = await supabase
      .from("employees")
      .insert({
        ...parsed.data,
        employee_code: employeeCode,
        created_by: ctx.profile?.id ?? null,
        updated_by: ctx.profile?.id ?? null,
      })
      .select("id, employee_code")
      .single();

    if (insertError) {
      logger.error("createEmployee insert error", insertError);
      return { success: false, error: insertError.message };
    }

    // Step 3: Insert initial status event
    await supabase.from("employee_status_events").insert({
      employee_id: employee.id,
      old_status: null,
      new_status: parsed.data.employee_status ?? "active",
      reason: "Employee created",
      effective_date: parsed.data.joining_date,
      created_by: ctx.profile?.id ?? null,
    });

    // Step 4: Audit
    await logAudit({
      module_code: "HR",
      entity_name: "employees",
      entity_id: employee.id,
      entity_reference: employee.employee_code,
      action: "create",
      new_values: {
        employee_code: employee.employee_code,
        employee_name: parsed.data.full_name_en,
      },
    });

    revalidatePath("/admin/hr/employees");

    return { success: true, data: { id: employee.id, employee_code: employee.employee_code } };
  } catch (err) {
    logger.error("createEmployee exception", err);
    return { success: false, error: "Failed to create employee" };
  }
}

// ============================================================================
// updateEmployee
// ============================================================================

export async function updateEmployee(
  employeeId: number,
  input: EmployeeUpdateInput
): Promise<ActionResult<void>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.employees.update") && !ctx.roleCodes?.includes("system_admin")) {
      return { success: false, error: "Permission denied" };
    }

    const parsed = employeeUpdateSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
    }

    const supabase = await createClient();

    // Fetch current employee to detect status change
    const { data: current, error: fetchError } = await supabase
      .from("employees")
      .select("id, employee_code, full_name_en, employee_status")
      .eq("id", employeeId)
      .is("deleted_at", null)
      .single();

    if (fetchError || !current) {
      return { success: false, error: "Employee not found" };
    }

    const { error: updateError } = await supabase
      .from("employees")
      .update({
        ...parsed.data,
        updated_by: ctx.profile?.id ?? null,
      })
      .eq("id", employeeId)
      .is("deleted_at", null);

    if (updateError) {
      logger.error("updateEmployee error", updateError);
      return { success: false, error: updateError.message };
    }

    // If status changed, insert status event
    if (parsed.data.employee_status && parsed.data.employee_status !== current.employee_status) {
      await supabase.from("employee_status_events").insert({
        employee_id: employeeId,
        old_status: current.employee_status,
        new_status: parsed.data.employee_status,
        reason: parsed.data.inactive_reason ?? "Status updated",
        effective_date: parsed.data.inactive_date ?? null,
        created_by: ctx.profile?.id ?? null,
      });

      await logAudit({
        module_code: "HR",
        entity_name: "employee_status_events",
        entity_id: employeeId,
        entity_reference: current.employee_code,
        action: "create",
        new_values: {
          parent_employee_id: employeeId,
          employee_code: current.employee_code,
          employee_name: current.full_name_en,
          old_status: current.employee_status,
          new_status: parsed.data.employee_status,
        },
      });
    }

    await logAudit({
      module_code: "HR",
      entity_name: "employees",
      entity_id: employeeId,
      entity_reference: current.employee_code,
      action: "update",
      new_values: {
        employee_code: current.employee_code,
        employee_name: current.full_name_en,
      },
    });

    revalidatePath("/admin/hr/employees");
    revalidatePath(`/admin/hr/employees/record/${employeeId}`);

    return { success: true };
  } catch (err) {
    logger.error("updateEmployee exception", err);
    return { success: false, error: "Failed to update employee" };
  }
}

// ============================================================================
// archiveEmployee
// ============================================================================

export async function archiveEmployee(
  employeeId: number,
  reason?: string
): Promise<ActionResult<void>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.employees.archive") && !ctx.roleCodes?.includes("system_admin")) {
      return { success: false, error: "Permission denied" };
    }

    const supabase = await createClient();

    const { data: current, error: fetchError } = await supabase
      .from("employees")
      .select("id, employee_code, full_name_en, employee_status")
      .eq("id", employeeId)
      .is("deleted_at", null)
      .single();

    if (fetchError || !current) {
      return { success: false, error: "Employee not found" };
    }

    const now = new Date().toISOString();

    const { error: archiveError } = await supabase
      .from("employees")
      .update({
        deleted_at: now,
        deleted_by: ctx.profile?.id ?? null,
        employee_status: "archived",
        inactive_date: new Date().toISOString().split("T")[0],
        inactive_reason: reason ?? "Archived",
        updated_by: ctx.profile?.id ?? null,
      })
      .eq("id", employeeId)
      .is("deleted_at", null);

    if (archiveError) {
      logger.error("archiveEmployee error", archiveError);
      return { success: false, error: archiveError.message };
    }

    // Status event
    await supabase.from("employee_status_events").insert({
      employee_id: employeeId,
      old_status: current.employee_status,
      new_status: "archived",
      reason: reason ?? "Archived",
      effective_date: new Date().toISOString().split("T")[0],
      created_by: ctx.profile?.id ?? null,
    });

    await logAudit({
      module_code: "HR",
      entity_name: "employees",
      entity_id: employeeId,
      entity_reference: current.employee_code,
      action: "archive",
      new_values: {
        employee_code: current.employee_code,
        employee_name: current.full_name_en,
        reason: reason ?? "Archived",
      },
    });

    revalidatePath("/admin/hr/employees");
    revalidatePath(`/admin/hr/employees/record/${employeeId}`);

    return { success: true };
  } catch (err) {
    logger.error("archiveEmployee exception", err);
    return { success: false, error: "Failed to archive employee" };
  }
}

// ============================================================================
// changeEmployeeStatus
// ============================================================================

export async function changeEmployeeStatus(
  employeeId: number,
  newStatus: string,
  reason?: string,
  effectiveDate?: string
): Promise<ActionResult<void>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.employees.update") && !ctx.roleCodes?.includes("system_admin")) {
      return { success: false, error: "Permission denied" };
    }

    const supabase = await createClient();

    const { data: current, error: fetchError } = await supabase
      .from("employees")
      .select("id, employee_code, full_name_en, employee_status")
      .eq("id", employeeId)
      .is("deleted_at", null)
      .single();

    if (fetchError || !current) {
      return { success: false, error: "Employee not found" };
    }

    const { error: updateError } = await supabase
      .from("employees")
      .update({
        employee_status: newStatus,
        updated_by: ctx.profile?.id ?? null,
      })
      .eq("id", employeeId)
      .is("deleted_at", null);

    if (updateError) {
      logger.error("changeEmployeeStatus error", updateError);
      return { success: false, error: updateError.message };
    }

    await supabase.from("employee_status_events").insert({
      employee_id: employeeId,
      old_status: current.employee_status,
      new_status: newStatus,
      reason: reason ?? null,
      effective_date: effectiveDate ?? null,
      created_by: ctx.profile?.id ?? null,
    });

    await logAudit({
      module_code: "HR",
      entity_name: "employee_status_events",
      entity_id: employeeId,
      entity_reference: current.employee_code,
      action: "create",
      new_values: {
        parent_employee_id: employeeId,
        employee_code: current.employee_code,
        employee_name: current.full_name_en,
        old_status: current.employee_status,
        new_status: newStatus,
      },
    });

    revalidatePath("/admin/hr/employees");
    revalidatePath(`/admin/hr/employees/record/${employeeId}`);

    return { success: true };
  } catch (err) {
    logger.error("changeEmployeeStatus exception", err);
    return { success: false, error: "Failed to change employee status" };
  }
}

// ============================================================================
// getEmployeeStatusHistory
// ============================================================================

export async function getEmployeeStatusHistory(
  employeeId: number
): Promise<ActionResult<EmployeeStatusEvent[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.employees.view") && !ctx.roleCodes?.includes("system_admin")) {
      return { success: false, error: "Permission denied" };
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from("employee_status_events")
      .select("*")
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false });

    if (error) {
      logger.error("getEmployeeStatusHistory error", error);
      return { success: false, error: error.message };
    }

    return { success: true, data: (data ?? []) as EmployeeStatusEvent[] };
  } catch (err) {
    logger.error("getEmployeeStatusHistory exception", err);
    return { success: false, error: "Failed to get status history" };
  }
}
