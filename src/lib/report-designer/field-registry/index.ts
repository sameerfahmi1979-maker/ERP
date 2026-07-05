/**
 * Report Designer — Field Registry Public Exports
 * Phase: REPORT DESIGNER UX.2 / UX.3
 */

export type {
  ReportFieldSensitivityLevel,
  ReportFieldDataType,
  ReportFieldModule,
  ReportFieldRegistryEntry,
  ReportFieldEntityGroup,
  ReportFieldModuleGroup,
  FieldPickerContext,
} from "./types";

export { REPORT_FIELD_REGISTRY } from "./registry";

export {
  getReportFieldRegistry,
  getActiveReportFieldEntries,
  getInsertableReportFieldEntries,
  getRestrictedFieldEntries,
  getReportFieldByPath,
  isReportFieldPathAllowed,
  isRegisteredRestrictedField,
  isReportFieldPathRegistered,
  getReportFieldsGroupedByModule,
  getReportFieldsGroupedByModuleSorted,
  getReportFieldSampleValues,
  searchReportFields,
} from "./registry-utils";

export {
  buildLegacyBindingRegistry,
  GENERATED_ERP_BINDING_REGISTRY,
} from "./legacy-binding-adapter";

export type { ReportOutputMode, ReportRenderContext } from "./governance";

export {
  isRestrictedOrConfidentialField,
  isRegisteredSensitiveField,
  canFieldBeInsertedForTemplate,
  getFieldInsertBlockReason,
  canFieldResolveInOutputMode,
  getRestrictedFieldMask,
  getRestrictedFieldsFromPaths,
  buildSensitiveFieldAuditMetadata,
} from "./governance";
