/**
 * Report Designer — Public API Index
 * Phase: REPORT DESIGNER.1
 *
 * Re-exports all types, schemas, and utilities for external consumers.
 * Import from "@/lib/report-designer" in server actions and future UI code.
 */

// Types
export type {
  ReportDesignerEngine,
  ReportDesignerLayoutJson,
  ReportDesignerLayoutRoot,
  ReportDesignerBlock,
  ReportDesignerBlockType,
  HeadingBlock,
  BodyTextSectionBlock,
  KeyValueSectionBlock,
  KeyValueFieldDef,
  DividerBlock,
  SpacerBlock,
  BrandingHeaderBlock,
  CompanyLogoBlock,
  SignatoryBlock,
  StampBlock,
  VerificationQrBlock,
  SaveVisualLayoutInput,
  VisualLayoutResult,
  LayoutSaveAuditMeta,
} from "./types";

export { CURRENT_LAYOUT_SCHEMA_VERSION, EMPTY_LAYOUT } from "./types";

// Constants
export {
  REPORT_DESIGNER_SCHEMA_VERSION,
  REPORT_DESIGNER_ENGINE,
  PAGE_SIZES,
  PERMITTED_FONT_FAMILIES,
  REPORT_DESIGNER_BLOCK_TYPES,
  EDITABLE_GOVERNANCE_STATUSES,
  LOCKED_GOVERNANCE_STATUSES,
  MAX_BLOCKS_PER_ZONE,
  MAX_BINDING_PATH_LENGTH,
  BINDING_PATH_REGEX,
  MAX_BLOCK_TEXT_LENGTH,
} from "./constants";
export type { PermittedFontFamily, ReportDesignerBlockType as BlockTypeConstant } from "./constants";

// Binding registry
export {
  ERP_BINDING_REGISTRY,
  SAFE_BINDING_PATHS,
  isAllowlistedBinding,
  extractBindingsFromText,
  validateTextBindings,
} from "./binding-registry";
export type { BindingDescriptor } from "./binding-registry";

// Zod schemas
export {
  ReportDesignerBlockSchema,
  ReportDesignerLayoutRootSchema,
  ReportDesignerLayoutJsonSchema,
  SaveVisualLayoutInputSchema,
} from "./layout-schema";
export type {
  ReportDesignerLayoutJsonInput,
  ReportDesignerBlockInput,
  SaveVisualLayoutInputValidated,
} from "./layout-schema";

// Layout validation helpers
export {
  validateLayoutZone,
  validateSaveLayoutInput,
  buildLayoutAuditMeta,
} from "./layout-validation";
export type { LayoutValidationResult } from "./layout-validation";

// Live test schema
export {
  ReportDesignerTestModeSchema,
  ReportDesignerTestInputSchema,
  buildSampleBindingValues,
} from "./live-test-schema";
export type {
  ReportDesignerTestMode,
  ReportDesignerTestDataSource,
  ReportDesignerTestInput,
  ReportDesignerTestContext,
  ReportDesignerTestResult,
  ReportDesignerTestOptions,
  ReportDesignerTestInputValidated,
} from "./live-test-schema";
