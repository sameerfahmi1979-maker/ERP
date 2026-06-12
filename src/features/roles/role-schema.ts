import { z } from "zod";

/**
 * Role Validation Schema
 */

export const roleStatusSchema = z.boolean();

export const createRoleSchema = z.object({
  role_code: z
    .string()
    .min(1, "Role code is required")
    .max(100)
    .regex(/^[a-z0-9_]+$/, "Role code must be lowercase snake_case"),
  role_name: z.string().min(1, "Role name is required").max(255),
  description: z.string().max(1000).optional().nullable(),
  is_system_role: z.boolean().default(false),
  is_active: z.boolean().default(true),
});

export const updateRoleSchema = createRoleSchema.partial().extend({
  id: z.number().int().positive(),
});

export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
