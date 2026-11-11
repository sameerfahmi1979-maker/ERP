/** Static wording only. Database messages, details and business values never reach the UI. */
export const savedIntakeErrorCodes:Readonly<Record<string,string>>={
 '22023':'The document was not saved because a review value was rejected. Your edits are retained. Reference: intake-22023.',
 '22P02':'The document was not saved because a number or selection is invalid. Your edits are retained. Reference: intake-22P02.',
 '22007':'The document was not saved because a date is invalid. Your edits are retained. Reference: intake-22007.',
 '22008':'The document was not saved because a date is outside the allowed range. Your edits are retained. Reference: intake-22008.',
 '23505':'The document was not saved because a unique value already exists. Your edits are retained. Reference: intake-23505.',
 '23503':'The document was not saved because a selected record is no longer available. Your edits are retained. Reference: intake-23503.',
 '23514':'The document was not saved because a database rule rejected a value. Your edits are retained. Reference: intake-23514.',
 '42703':'The document was not saved because the save service and database fields do not match. Your edits are retained. Reference: intake-42703.',
 '42702':'The document was not saved because of a save-service query conflict. Your edits are retained. Reference: intake-42702.',
};
export const savedIntakeErrorMessages:Readonly<Record<string,string>>={
 '22023:Invalid intake fields or file extension':'The document was not saved. Check its title, category, confidentiality and filename; keep the original file extension. Reference: intake-fields.',
 '22023:Metadata definition mismatch':'The document was not saved. Reload the saved review to use the current metadata fields. Reference: intake-field-type.',
 '22023:Required profile metadata missing':'The document was not saved. Complete the required fields for this document type. Reference: intake-required-profile.',
 '22023:Invalid typed metadata':'The document was not saved because a metadata field has an unsupported format. Reference: intake-metadata-format.',
 '22023:Invalid ownership':'The document was not saved. Select an active company and a branch belonging to it. Reference: intake-ownership.',
 '22023:Tag unavailable':'The document was not saved. Remove unavailable tags or select them again. Reference: intake-tags.',
 '22023:Repeated link':'The document was not saved. Remove repeated linked records. Reference: intake-links.',
 '22023:Expiry precedes issue date':'The document was not saved. Expiry must be on or after the issue date. Reference: intake-dates.',
 '22023:Required metadata is missing: Issuing Authority':'The document was not saved. Enter Issuing Authority before saving. Reference: intake-issuing-authority.',
};
