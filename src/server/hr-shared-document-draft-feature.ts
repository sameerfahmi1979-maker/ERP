import "server-only";

export function isSharedDocumentEmployeeDraftEnabled(): boolean {
  return process.env.DMS_HR_SHARED_DRAFTS_ENABLED === "true";
}
