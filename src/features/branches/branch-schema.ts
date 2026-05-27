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
  // Basic Branch Details
  owner_company_id: z.number().int().positive("Owner company is required"),
  branch_code: z
    .string()
    .min(1, "Branch code is required")
    .max(50)
    .regex(/^[A-Z0-9_-]+$/, "Branch code must be uppercase letters, numbers, hyphens, or underscores"),
  branch_name_en: z.string().min(1, "English branch name is required").max(255),
  branch_name_ar: z.string().max(255).optional().nullable(),
  status: branchStatusSchema.default("active"),
  
  // Phase 002D: Branch categorization
  branch_type: z.string().max(100).optional().nullable(),
  is_main_branch: z.boolean().default(false),
  operating_status: z.enum(["active", "maintenance", "suspended", "closed"]).default("active"),
  
  // Location
  emirate: z.string().max(100).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  area: z.string().max(100).optional().nullable(),
  address_line_1: z.string().max(500).optional().nullable(),
  address_line_2: z.string().max(500).optional().nullable(),
  po_box: z.string().max(50).optional().nullable(),
  makani_number: z.string().max(50).optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  
  // Contact
  phone: z.string().max(50).optional().nullable(),
  email: z.string().email("Invalid email format").max(255).optional().nullable().or(z.literal("")),
  contact_person_name: z.string().max(255).optional().nullable(),
  contact_phone: z.string().max(50).optional().nullable(),
  contact_email: z.string().email("Invalid contact email format").max(255).optional().nullable().or(z.literal("")),
  
  // Operational Flags (Phase 002D)
  has_workshop: z.boolean().default(false),
  has_warehouse: z.boolean().default(false),
  has_yard: z.boolean().default(false),
  has_weighbridge: z.boolean().default(false),
  
  // Notes
  notes: z.string().optional().nullable(),
});

// Update schema (for editing branches)
export const updateBranchSchema = createBranchSchema.partial().extend({
  id: z.number().int().positive(),
});

// Type exports
export type CreateBranchInput = z.infer<typeof createBranchSchema>;
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;
export type BranchStatus = z.infer<typeof branchStatusSchema>;
