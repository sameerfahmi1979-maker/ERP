/**
 * Executive Ledger Template Engine — Constants
 * Phase: BRANDING.5
 */

/** Default A4 page dimensions in mm */
export const EL_PAGE_WIDTH_MM = 210;
export const EL_PAGE_HEIGHT_MM = 297;

/** Margin in mm for A4 print */
export const EL_MARGIN_MM = 12;

/** Double-border gap in px (outer ↔ inner frame) */
export const EL_DOUBLE_BORDER_GAP_PX = 4;

/** Neutral fallback company name when no branding is provided */
export const EL_NEUTRAL_COMPANY_NAME = "ERP Document";

/** Neutral footer fallback */
export const EL_NEUTRAL_FOOTER = "Confidential — Internal Document";

/** Max logo height in the header */
export const EL_LOGO_MAX_HEIGHT_PX = 56;

/** Stamp image max dimensions */
export const EL_STAMP_SIZE_PX = 80;

/** Signature image max dimensions */
export const EL_SIGNATURE_MAX_WIDTH_PX = 160;
export const EL_SIGNATURE_MAX_HEIGHT_PX = 56;

/** Default document orientation */
export const EL_DEFAULT_ORIENTATION = "portrait" as const;

/** CSS class prefix to avoid collisions in the host document */
export const EL_CSS_PREFIX = "el";
