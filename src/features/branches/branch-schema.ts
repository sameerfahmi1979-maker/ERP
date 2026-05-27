import { z } from "zod";

/**
 * Branch Validation Schema
 * 
 * Based on the branches table schema from the ERP foundation migration.
 */

// Status enum
export const branchStatusSchema = z.enum(["active", "inactive", "suspended"]);

// Create schema (for new branches)
export const createBranchSchema = z.object({
  owner_company_id: z.number().int().positive("Owner company is required"),
  branch_code: z
    .string()
    .min(1, "Branch code is required")
    .max(50)
    .regex(/^[A-Z0-9_-]+$/, "Branch code must be uppercase letters, numbers, hyphens, or underscores"),
  branch_name_en: z.string().min(1, "English branch name is required").max(255),
  branch_name_ar: z.string().max(255).optional().nullable(),
  emirate: z.string().max(100).optional().nullable(),
  area: z.string().max(100).optional().nullable(),
  address_line_1: z.string().max(500).optional().nullable(),
  address_line_2: z.string().max(500).optional().nullable(),
  po_box: z.string().max(50).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  email: z.string().email("Invalid email format").max(255).optional().nullable().or(z.literal("")),
  status: branchStatusSchema.default("active"),
});

// Update schema (for editing branches)
export const updateBranchSchema = createBranchSchema.partial().extend({
  id: z.number().int().positive(),
});

// Type exports
export type CreateBranchInput = z.infer<typeof createBranchSchema>;
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;
export type BranchStatus = z.infer<typeof branchStatusSchema>;
