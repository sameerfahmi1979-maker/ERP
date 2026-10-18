/** A generic data-grid export must never masquerade as an issued document. */
export function usesOfficialDocumentSurface(entry: {document_class?: unknown;is_letter_type?: boolean;report_category?: string}) {
 return ['A','B','C','D'].includes(String(entry.document_class??'')) || entry.is_letter_type === true || ['letter','certificate','form','checklist','badge','external_submission'].includes(entry.report_category??'');
}
