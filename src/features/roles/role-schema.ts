import { z } from "zod";

/**
 * Role Validation Schemas — USERS.3
 * Note: is_system_role is NOT included in any client schema.
 * New roles are always custom (is_system_role=false) — enforced server-side.
 */

export const roleStatusSchema = z.boolean();

export const createRoleSchema = z.object({
  role_code: z
    .string()
    .min(1, "Role code is required")
    .max(100)
    .regex(/^[a-z0-9_]+$/, "Role code must be lowercase snake_case"),
  role_name: z.string().min(1, "Role name is required").max(255),
  display_name: z.string().max(255).optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
  role_category: z.string().max(100).optional().nullable(),
  role_level: z.string().max(100).optional().nullable(),
  is_assignable: z.boolean().default(true),
  notes: z.string().max(2000).optional().nullable(),
  // is_active defaults true — not in create form; admin can set it after creation
  is_active: z.boolean().default(true),
});

export const updateRoleSchema = z.object({
  id: z.number().int().positive(),
  // role_code must NOT be sent — read-only after creation; strip at server if present
  role_name: z.string().min(1).max(255).optional(),
  display_name: z.string().max(255).optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
  role_category: z.string().max(100).optional().nullable(),
  role_level: z.string().max(100).optional().nullable(),
  is_assignable: z.boolean().optional(),
  notes: z.string().max(2000).optional().nullable(),
  is_active: z.boolean().optional(),
  // is_system_role must NOT be sent — never editable from UI
});

export const cloneRoleSchema = z.object({
  role_code: z
    .string()
    .min(1, "Role code is required")
    .max(100)
    .regex(/^[a-z0-9_]+$/, "Role code must be lowercase snake_case"),
  role_name: z.string().min(1, "Role name is required").max(255),
  display_name: z.string().max(255).optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
  role_category: z.string().max(100).optional().nullable(),
  role_level: z.string().max(100).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
export type CloneRoleInput = z.infer<typeof cloneRoleSchema>;
