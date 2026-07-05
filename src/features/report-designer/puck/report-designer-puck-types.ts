/**
 * Report Designer — Puck Component Type Definitions
 * Phase: REPORT DESIGNER.3 — ERP Block Library Foundation
 *
 * Maps all 10 REPORT DESIGNER.1 block definitions to Puck's Props/Config type system.
 * In Puck v0.22, Config<Components> maps component names directly to their prop types.
 */

import type { Config } from "@puckeditor/core";
import type {
  HeadingBlockProps,
  BodyTextSectionBlockProps,
  KeyValueSectionBlockProps,
  DividerBlockProps,
  SpacerBlockProps,
  BrandingHeaderBlockProps,
  CompanyLogoBlockProps,
  SignatoryBlockProps,
  StampBlockProps,
  VerificationQrBlockProps,
  ReportTableBlockProps,
  ColumnStripBlockProps,
} from "../blocks";

export type {
  HeadingBlockProps,
  BodyTextSectionBlockProps,
  KeyValueSectionBlockProps,
  DividerBlockProps,
  SpacerBlockProps,
  BrandingHeaderBlockProps,
  CompanyLogoBlockProps,
  SignatoryBlockProps,
  StampBlockProps,
  VerificationQrBlockProps,
  ReportTableBlockProps,
  ColumnStripBlockProps,
};

// ─────────────────────────────────────────────────────────────────────────────
// Puck component map — all 12 approved ERP blocks (UX.1 adds ColumnStripBlock)
// ─────────────────────────────────────────────────────────────────────────────

export type ReportDesignerPuckComponents = {
  HeadingBlock: HeadingBlockProps;
  BodyTextSectionBlock: BodyTextSectionBlockProps;
  KeyValueSectionBlock: KeyValueSectionBlockProps;
  DividerBlock: DividerBlockProps;
  SpacerBlock: SpacerBlockProps;
  BrandingHeaderBlock: BrandingHeaderBlockProps;
  CompanyLogoBlock: CompanyLogoBlockProps;
  SignatoryBlock: SignatoryBlockProps;
  StampBlock: StampBlockProps;
  VerificationQrBlock: VerificationQrBlockProps;
  ReportTableBlock: ReportTableBlockProps;
  ColumnStripBlock: ColumnStripBlockProps;
};

/** Typed Puck Config for the Report Designer editor */
export type ReportDesignerPuckConfig = Config<ReportDesignerPuckComponents>;
