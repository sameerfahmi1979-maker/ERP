import { z } from "zod";
import { authEmailSchema, passwordPolicySchema } from "@/lib/validation/auth";

/**
 * User Profile Admin Update Schema
 * For admin-controlled user profile updates (not self-service)
 */

export const adminUpdateUserProfileSchema = z.object({
  id: z.number().int().positive(),
  full_name: z.string().max(255).optional().nullable(),
  display_name: z.string().max(255).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  job_title: z.string().max(255).optional().nullable(),
  department: z.string().max(255).optional().nullable(),
  owner_company_id: z.number().int().positive().optional().nullable(),
  branch_id: z.number().int().positive().optional().nullable(),
  status: z.enum(["active", "inactive", "suspended"]).optional(),
  notes: z.string().max(2000).optional().nullable(),
  employee_reference: z.string().max(100).optional().nullable(),
});

export const userRoleAssignmentSchema = z.object({
  user_profile_id: z.number().int().positive("User is required"),
  role_id: z.number().int().positive("Role is required"),
  owner_company_id: z.number().int().positive().optional().nullable(),
  branch_id: z.number().int().positive().optional().nullable(),
  is_active: z.boolean().default(true),
});

export const userRoleRemovalSchema = z.object({
  user_role_id: z.number().int().positive(),
});

// Phase 002D: Create User Schema — USERS.2A updates temporary_password to use strong policy
export const createUserSchema = z.object({
  creation_operation_id: z.string().uuid().optional(),
  email: authEmailSchema,
  temporary_password: passwordPolicySchema.optional(),
  send_invite_email: z.boolean().default(false),
  full_name: z.string().min(1, "Full name is required").max(255),
  display_name: z.string().max(255).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  job_title: z.string().max(255).optional().nullable(),
  department: z.string().max(255).optional().nullable(),
  owner_company_id: z.number().int().positive().optional().nullable(),
  branch_id: z.number().int().positive().optional().nullable(),
  status: z.enum(["active", "inactive", "suspended"]).default("active"),
  // Initial role assignment (optional)
  initial_role_id: z.number().int().positive().optional().nullable(),
  initial_role_scope_company_id: z.number().int().positive().optional().nullable(),
  initial_role_scope_branch_id: z.number().int().positive().optional().nullable(),
  initial_role_global_confirmed: z.boolean().optional(),
}).superRefine((value,ctx)=>{
  if(value.initial_role_id && !value.initial_role_scope_company_id && value.initial_role_global_confirmed!==true)
    ctx.addIssue({code:"custom",path:["initial_role_scope_company_id"],message:"Choose a company scope explicitly, or confirm global access."});
  if(value.initial_role_scope_branch_id && !value.initial_role_scope_company_id)
    ctx.addIssue({code:"custom",path:["initial_role_scope_branch_id"],message:"A branch scope requires its company."});
});

// Type exports
export type AdminUpdateUserProfileInput = z.infer<typeof adminUpdateUserProfileSchema>;
export type UserRoleAssignmentInput = z.infer<typeof userRoleAssignmentSchema>;
export type UserRoleRemovalInput = z.infer<typeof userRoleRemovalSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
