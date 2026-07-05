"use client";

/**
 * Report Designer — Full ERP Puck Config
 * Phase: REPORT DESIGNER.3 — ERP Block Library Foundation
 *
 * Security rules (enforced):
 *  - No dangerouslySetInnerHTML in any block render
 *  - No direct DB/Supabase access from block components
 *  - No service role / admin client
 *  - No external image URL fields (assets resolved from branding profile at render time)
 *  - Binding paths validated against ERP_BINDING_REGISTRY allowlist
 */

import {
  headingBlockConfig,
  bodyTextSectionBlockConfig,
  keyValueSectionBlockConfig,
  dividerBlockConfig,
  spacerBlockConfig,
  brandingHeaderBlockConfig,
  companyLogoBlockConfig,
  signatoryBlockConfig,
  stampBlockConfig,
  verificationQrBlockConfig,
  reportTableBlockConfig,
  columnStripBlockConfig,
} from "../blocks";
import type { ReportDesignerPuckConfig } from "./report-designer-puck-types";

export const reportDesignerPuckConfig: ReportDesignerPuckConfig = {
  components: {
    HeadingBlock: headingBlockConfig,
    BodyTextSectionBlock: bodyTextSectionBlockConfig,
    KeyValueSectionBlock: keyValueSectionBlockConfig,
    DividerBlock: dividerBlockConfig,
    SpacerBlock: spacerBlockConfig,
    BrandingHeaderBlock: brandingHeaderBlockConfig,
    CompanyLogoBlock: companyLogoBlockConfig,
    SignatoryBlock: signatoryBlockConfig,
    StampBlock: stampBlockConfig,
    VerificationQrBlock: verificationQrBlockConfig,
    ReportTableBlock: reportTableBlockConfig,
    ColumnStripBlock: columnStripBlockConfig,
  },
};
