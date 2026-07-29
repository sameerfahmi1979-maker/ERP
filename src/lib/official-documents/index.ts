/**
 * OFFICIAL DOCS.1 — Global Official Letters & Forms Generator (public API).
 */

export * from "./types";
export {
  OFFICIAL_DOCUMENT_DEFINITIONS,
  getOfficialDocumentDefinition,
  listOfficialDocumentDefinitions,
  validateOfficialDocumentDefinition,
  validateOfficialDocumentRegistry,
  isGeneratable,
  supportsLanguage,
  buildInputsSchema,
  findMissingDataError,
} from "./registry";
export { renderOfficialDocumentHtml } from "./layout/render";
