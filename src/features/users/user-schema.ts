import { z } from "zod";

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

// Type exports
export type AdminUpdateUserProfileInput = z.infer<typeof adminUpdateUserProfileSchema>;
export type UserRoleAssignmentInput = z.infer<typeof userRoleAssignmentSchema>;
export type UserRoleRemovalInput = z.infer<typeof userRoleRemovalSchema>;
