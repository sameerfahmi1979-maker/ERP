/**
 * Report Designer — Zod Layout Schema
 * Phase: REPORT DESIGNER.1
 *
 * Canonical Zod schemas that mirror the TypeScript types in types.ts.
 * All layout JSON MUST pass these schemas before save or render.
 *
 * Security enforcement:
 *  - No raw HTML allowed in any string field
 *  - All data bindings validated against ERP_BINDING_REGISTRY
 *  - No script, event-handler, or external URL injection possible
 *  - Maximum lengths enforced on all text fields
 */

import { z } from "zod";
import {
  REPORT_DESIGNER_SCHEMA_VERSION,
  MAX_BLOCKS_PER_ZONE,
  MAX_BLOCK_TEXT_LENGTH,
  PERMITTED_FONT_FAMILIES,
  REPORT_TABLE_MAX_ROWS,
  SAFE_COLUMN_KEY_REGEX,
} from "./constants";
import { SAFE_BINDING_PATHS, validateTextBindings } from "./binding-registry";

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Plain text validator — rejects HTML tags, script, and common injection patterns */
const safePlainText = (maxLen = MAX_BLOCK_TEXT_LENGTH) =>
  z
    .string()
    .max(maxLen, `Text must be ${maxLen} characters or fewer`)
    .refine(
      (val) => !/<[a-zA-Z/!]/.test(val),
      "HTML tags are not permitted in visual template text"
    )
    .refine(
      (val) => !/\b(script|eval|innerHTML|outerHTML|document\.write|on\w+=)\b/i.test(val),
      "Script injection detected — not permitted"
    );

/** Validates a text string and all its {{binding}} placeholders are allowlisted */
const textWithValidatedBindings = (maxLen = MAX_BLOCK_TEXT_LENGTH) =>
  safePlainText(maxLen).superRefine((val, ctx) => {
    const unknown = validateTextBindings(val);
    if (unknown.length > 0) {
      ctx.addIssue({
        code: "custom",
        message: `Unknown binding(s): ${unknown.join(", ")}. Use only allowlisted ERP bindings.`,
      });
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// Individual block schemas
// ─────────────────────────────────────────────────────────────────────────────

const HeadingBlockSchema = z.object({
  type: z.literal("HeadingBlock"),
  props: z.object({
    text: safePlainText(500),
    level: z.enum(["h1", "h2", "h3"]),
    align: z.enum(["left", "center", "right"]).optional(),
  }),
});

const BodyTextSectionBlockSchema = z.object({
  type: z.literal("BodyTextSectionBlock"),
  props: z.object({
    title: safePlainText(200).optional(),
    content: textWithValidatedBindings(MAX_BLOCK_TEXT_LENGTH),
    /**
     * REPORT DESIGNER UX.1: Optional ProseMirror JSON rich text.
     * Validated by security review; content string fallback always required.
     * MUST be nullable — Puck defaultProps and cleared/legacy DB rows store
     * richContent as JSON null. Rejecting null makes the whole zone silently
     * fall back to EMPTY_LAYOUT on load (blank editor + blank preview).
     */
    richContent: z
      .object({
        type: z.literal("doc"),
        content: z.array(z.unknown()).max(500, "Rich text too many nodes"),
      })
      .passthrough()
      .superRefine((val, ctx) => {
        const str = JSON.stringify(val);
        if (str.length > MAX_BLOCK_TEXT_LENGTH * 4) {
          ctx.addIssue({
            code: "custom",
            message: `richContent JSON too large (max ${MAX_BLOCK_TEXT_LENGTH * 4} chars)`,
          });
        }
      })
      .nullable()
      .optional(),
    language: z.enum(["en", "ar", "bilingual"]).optional(),
  }),
});

const KeyValueFieldDefSchema = z.object({
  label: safePlainText(200),
  binding: z
    .string()
    .refine((val) => SAFE_BINDING_PATHS.includes(val), {
      message:
        "Unknown binding path — must be a key in ERP_BINDING_REGISTRY",
    }),
  emphasized: z.boolean().optional(),
  isSubHeader: z.boolean().optional(),
});

const KeyValueSectionBlockSchema = z.object({
  type: z.literal("KeyValueSectionBlock"),
  props: z.object({
    title: safePlainText(200).optional(),
    fields: z
      .array(KeyValueFieldDefSchema)
      .min(1, "KeyValueSectionBlock must have at least one field")
      .max(30, "KeyValueSectionBlock may have at most 30 fields"),
  }),
});

const DividerBlockSchema = z.object({
  type: z.literal("DividerBlock"),
  props: z.object({
    label: safePlainText(100).optional(),
  }),
});

const SpacerBlockSchema = z.object({
  type: z.literal("SpacerBlock"),
  props: z.object({
    heightMm: z.number().int().min(4).max(40).optional(),
  }),
});

const BrandingHeaderBlockSchema = z.object({
  type: z.literal("BrandingHeaderBlock"),
  props: z.object({
    showLogo: z.boolean().optional(),
    showName: z.boolean().optional(),
    showAddress: z.boolean().optional(),
    showContact: z.boolean().optional(),
  }),
});

const CompanyLogoBlockSchema = z.object({
  type: z.literal("CompanyLogoBlock"),
  props: z.object({
    variant: z.enum(["report_logo", "small_logo"]).optional(),
    align: z.enum(["left", "center", "right"]).optional(),
    maxHeightMm: z.number().int().min(16).max(80).optional(),
  }),
});

const SignatoryBlockSchema = z.object({
  type: z.literal("SignatoryBlock"),
  props: z.object({
    showSignature: z.boolean().optional(),
    nameOverride: safePlainText(200).optional(),
    titleOverrideEn: safePlainText(200).optional(),
  }),
});

const StampBlockSchema = z.object({
  type: z.literal("StampBlock"),
  props: z.object({
    align: z.enum(["left", "center", "right"]).optional(),
    sizeMm: z.number().int().min(20).max(60).optional(),
  }),
});

const VerificationQrBlockSchema = z.object({
  type: z.literal("VerificationQrBlock"),
  props: z.object({
    label: safePlainText(100).optional(),
    align: z.enum(["left", "center", "right"]).optional(),
    sizeMm: z.number().int().min(20).max(50).optional(),
  }),
});

// ── REPORT DESIGNER.8: ReportTableBlock ──────────────────────────────────────

/** Sensitive column key fragments that must be blocked from table configs */
const SENSITIVE_COLUMN_KEY_FRAGMENTS = [
  "salary", "iban", "bank", "account", "passport", "eid", "visa",
  "medical", "health", "insurance", "token", "secret", "api_key",
  "ocr", "extracted", "embedding", "vector", "password", "pin",
];

const safeColumnKey = z
  .string()
  .min(1, "Column key is required")
  .max(80, "Column key must be 80 characters or fewer")
  .regex(SAFE_COLUMN_KEY_REGEX, "Column key must be a safe plain identifier (letters, digits, underscore, dot)")
  .refine(
    (val) => !SENSITIVE_COLUMN_KEY_FRAGMENTS.some((f) => val.toLowerCase().includes(f)),
    "Column key contains a sensitive field fragment that is not allowed in visual templates"
  );

const ReportTableColumnDefSchema = z.object({
  key: safeColumnKey,
  label: safePlainText(200),
  width: z.string().max(20).optional(),
  align: z.enum(["left", "center", "right"]).optional(),
  format: z.enum(["text", "date", "number", "money", "badge"]).optional(),
});

const ReportTableBlockSchema = z.object({
  type: z.literal("ReportTableBlock"),
  props: z.object({
    title: safePlainText(200).optional(),
    dataSource: z.literal("report.preview_rows"),
    columns: z
      .array(ReportTableColumnDefSchema)
      .min(1, "ReportTableBlock must have at least one column")
      .max(20, "ReportTableBlock may have at most 20 columns"),
    maxRows: z
      .number()
      .int()
      .min(1)
      .max(REPORT_TABLE_MAX_ROWS, `maxRows cannot exceed ${REPORT_TABLE_MAX_ROWS}`)
      .optional(),
    showRowNumbers: z.boolean().optional(),
    showHeader: z.boolean().optional(),
    emptyText: safePlainText(200).optional(),
    density: z.enum(["compact", "normal"]).optional(),
  }),
});

// ── REPORT DESIGNER UX.1: ColumnStripBlock ───────────────────────────────────

/** Allowed content types for a column slot */
const COLUMN_SLOT_CONTENT_TYPES = [
  "none", "logo", "heading", "text", "key_value", "signatory", "stamp", "qr",
] as const;

/** Blocked content types inside column slots (must not allow nesting) */
const BLOCKED_SLOT_TYPES = new Set(["BrandingHeaderBlock", "ReportTableBlock", "ColumnStripBlock"]);

const ColumnStripSlotSchema = z.object({
  contentType: z.enum(COLUMN_SLOT_CONTENT_TYPES),
  headingText: safePlainText(300).optional(),
  headingLevel: z.enum(["h1", "h2", "h3"]).optional(),
  headingAlign: z.enum(["left", "center", "right"]).optional(),
  bodyTitle: safePlainText(200).optional(),
  bodyContent: textWithValidatedBindings(MAX_BLOCK_TEXT_LENGTH).optional(),
  kvTitle: safePlainText(200).optional(),
  kvLabel: safePlainText(200).optional(),
  kvBinding: z.string().refine(
    (val) => !val || SAFE_BINDING_PATHS.includes(val),
    { message: "Unknown kvBinding — must be in ERP_BINDING_REGISTRY" }
  ).optional(),
  logoVariant: z.enum(["report_logo", "small_logo"]).optional(),
  logoAlign: z.enum(["left", "center", "right"]).optional(),
  logoMaxHeightMm: z.number().int().min(16).max(80).optional(),
  showSignature: z.boolean().optional(),
  signatoryNameOverride: safePlainText(200).optional(),
  signatoryTitleOverride: safePlainText(200).optional(),
  stampSizeMm: z.number().int().min(20).max(60).optional(),
  stampAlign: z.enum(["left", "center", "right"]).optional(),
  qrLabel: safePlainText(100).optional(),
  qrSizeMm: z.number().int().min(20).max(50).optional(),
  qrAlign: z.enum(["left", "center", "right"]).optional(),
}).superRefine((val, ctx) => {
  if (BLOCKED_SLOT_TYPES.has(val.contentType)) {
    ctx.addIssue({ code: "custom", message: `contentType '${val.contentType}' is not allowed inside ColumnStripBlock slots` });
  }
});

const ColumnStripBlockSchema = z.object({
  type: z.literal("ColumnStripBlock"),
  props: z.object({
    layout: z.enum(["equal", "left-wide", "right-wide", "2-col", "3-col"]),
    verticalAlign: z.enum(["top", "middle", "bottom"]).optional(),
    gap: z.enum(["sm", "md", "lg"]).optional(),
    leftSlot: ColumnStripSlotSchema.optional(),
    centerSlot: ColumnStripSlotSchema.optional(),
    rightSlot: ColumnStripSlotSchema.optional(),
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// Block discriminated union schema
// ─────────────────────────────────────────────────────────────────────────────

export const ReportDesignerBlockSchema = z.discriminatedUnion("type", [
  HeadingBlockSchema,
  BodyTextSectionBlockSchema,
  KeyValueSectionBlockSchema,
  DividerBlockSchema,
  SpacerBlockSchema,
  BrandingHeaderBlockSchema,
  CompanyLogoBlockSchema,
  SignatoryBlockSchema,
  StampBlockSchema,
  VerificationQrBlockSchema,
  ReportTableBlockSchema,
  ColumnStripBlockSchema,
]);

// ─────────────────────────────────────────────────────────────────────────────
// Layout root schema
// ─────────────────────────────────────────────────────────────────────────────

export const ReportDesignerLayoutRootSchema = z.object({
  props: z.object({
    orientation: z.enum(["portrait", "landscape"]).optional(),
    pageSize: z.enum(["A4", "A3", "Letter"]).optional(),
    fontFamily: z
      .string()
      .refine(
        (val) => (PERMITTED_FONT_FAMILIES as readonly string[]).includes(val),
        `fontFamily must be one of: ${PERMITTED_FONT_FAMILIES.join(", ")}`
      )
      .optional(),
    languageMode: z.enum(["en", "ar", "bilingual"]).optional(),
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// Top-level layout JSON schema
// ─────────────────────────────────────────────────────────────────────────────

export const ReportDesignerLayoutJsonSchema = z.object({
  schemaVersion: z
    .number()
    .int()
    .min(1)
    .max(REPORT_DESIGNER_SCHEMA_VERSION, "Unsupported schema version"),
  engine: z.literal("puck"),
  content: z
    .array(ReportDesignerBlockSchema)
    .max(MAX_BLOCKS_PER_ZONE, `A layout zone may not exceed ${MAX_BLOCKS_PER_ZONE} blocks`),
  root: ReportDesignerLayoutRootSchema,
});

// ─────────────────────────────────────────────────────────────────────────────
// Save layout input schema
// ─────────────────────────────────────────────────────────────────────────────

export const SaveVisualLayoutInputSchema = z.object({
  templateId: z.number().int().positive(),
  bodyLayout: ReportDesignerLayoutJsonSchema,
  headerLayout: ReportDesignerLayoutJsonSchema.optional(),
  footerLayout: ReportDesignerLayoutJsonSchema.optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Inferred types
// ─────────────────────────────────────────────────────────────────────────────

export type ReportDesignerLayoutJsonInput = z.input<typeof ReportDesignerLayoutJsonSchema>;
export type ReportDesignerBlockInput = z.input<typeof ReportDesignerBlockSchema>;
export type SaveVisualLayoutInputValidated = z.output<typeof SaveVisualLayoutInputSchema>;
