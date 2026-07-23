/**
 * ERP PDF Generation — Core Types
 * Phase: ERP PDF.1 — Production PDF Generation Framework (2026-07-23)
 */

import { z } from "zod";

// ─── Renderer Types ────────────────────────────────────────────────────────

export type PdfRenderer = "gotenberg" | "jspdf" | "print";

export type PdfOutputProfile = "standard" | "pdfa" | "pdfua";

export type PdfPageSize = "A4" | "A3" | "LETTER";

export type PdfOrientation = "portrait" | "landscape";

export type PdfDirection = "ltr" | "rtl" | "auto";

export type PdfLocale = "en" | "ar" | "en-ar";

// ─── Render Request ────────────────────────────────────────────────────────

export const PdfRenderRequestSchema = z.object({
  /** Unique key for the template (e.g. "hr-employment-letter-en") */
  templateKey: z.string().min(1),
  /** Version of the template to use (resolved server-side if omitted) */
  templateVersion: z.number().int().positive().optional(),
  /** The company whose branding should be applied */
  ownerCompanyId: z.number().int().positive(),
  /** The ERP module this record belongs to */
  sourceRecordType: z.string().min(1),
  /** The primary key of the source record */
  sourceRecordId: z.number().int().positive(),
  /** Locale for text rendering */
  locale: z.enum(["en", "ar", "en-ar"]).default("en"),
  /** Text direction */
  direction: z.enum(["ltr", "rtl", "auto"]).default("ltr"),
  /** Paper size */
  pageSize: z.enum(["A4", "A3", "LETTER"]).default("A4"),
  /** Page orientation */
  orientation: z.enum(["portrait", "landscape"]).default("portrait"),
  /** PDF output profile */
  outputProfile: z.enum(["standard", "pdfa", "pdfua"]).default("standard"),
  /** Optional label for the generated file (used in history row) */
  outputLabel: z.string().max(255).optional(),
});

export type PdfRenderRequest = z.infer<typeof PdfRenderRequestSchema>;

// ─── Render Result ─────────────────────────────────────────────────────────

export type PdfValidationStatus = "passed" | "failed" | "warning" | "skipped";

export interface PdfRenderResult {
  /** The generated PDF bytes */
  fileBuffer: Buffer;
  /** Number of pages in the generated PDF */
  pageCount: number;
  /** Renderer used (e.g. "gotenberg@8") */
  renderer: string;
  /** Renderer version string */
  rendererVersion: string;
  /** SHA-256 hex checksum of the file bytes */
  checksum: string;
  /** Result of PDF/A or PDF/UA validation (if requested) */
  validationStatus: PdfValidationStatus;
  /** Raw veraPDF or equivalent validation report */
  validationReport?: unknown;
  /** File size in bytes */
  fileSizeBytes: number;
}

// ─── Print Token ───────────────────────────────────────────────────────────

export interface PrintTokenPayload {
  templateKey: string;
  recordType: string;
  recordId: number;
  userId: number;
  ownerCompanyId: number;
  /** Unix timestamp (seconds) when this token expires */
  exp: number;
}

// ─── Template Registration ─────────────────────────────────────────────────

export type TemplateGovernanceStatus = "draft" | "in_review" | "approved" | "published" | "retired";

export interface PdfTemplateRegistration {
  templateKey: string;
  templateName: string;
  module: string;
  documentType: string;
  renderer: PdfRenderer;
  pageSize: PdfPageSize;
  orientation: PdfOrientation;
  locale: PdfLocale;
  direction: PdfDirection;
  governanceStatus: TemplateGovernanceStatus;
  /** erp_report_templates.id if backed by the DB template registry */
  dbTemplateId?: number;
}

// ─── Storage / History ────────────────────────────────────────────────────

export interface GeneratedPdfRecord {
  id: number;
  templateKey: string;
  templateVersion: number;
  sourceRecordType: string;
  sourceRecordId: number;
  ownerCompanyId: number;
  storagePath: string;
  fileName: string;
  fileSizeBytes: number;
  pageCount: number;
  checksum: string;
  renderer: string;
  rendererVersion: string;
  outputProfile: PdfOutputProfile;
  locale: PdfLocale;
  direction: PdfDirection;
  generatedBy: number;
  generatedAt: string;
  validationStatus: PdfValidationStatus;
  approvalStatus: "pending" | "approved" | "rejected" | null;
  approvedBy: number | null;
  approvedAt: string | null;
}
