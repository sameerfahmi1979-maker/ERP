/** Value-free, serializable validation feedback shared by server actions and forms. */
export type WorkspaceFieldErrors = Record<string, string>;

export function workspaceValidationFailure(issues: readonly { path: readonly PropertyKey[] }[]) {
  const fieldErrors: WorkspaceFieldErrors = {};
  for (const issue of issues) {
    const field = issue.path[0];
    if (typeof field === "string" && /^[a-z][a-z0-9_]*$/i.test(field)) {
      fieldErrors[field] = "Check the required value and format.";
    }
  }
  return { success: false as const, error: "Check the highlighted fields before saving.", fieldErrors };
}

export const WORKSPACE_FIELD_ERRORS_EVENT = "workspace-field-errors";

/** Dispatch only to the submitting form; a late response must never affect another tab. */
export function reportWorkspaceFieldErrors(target: string | HTMLElement | null, fieldErrors?: WorkspaceFieldErrors) {
  if (!fieldErrors || typeof document === "undefined") return;
  // Async callers capture the element before await, never resolve a reused ID afterward.
  const form = typeof target === "string" ? document.getElementById(target) : target;
  if (!form?.isConnected) return;
  form.dispatchEvent(new CustomEvent(WORKSPACE_FIELD_ERRORS_EVENT, {
    bubbles: true, detail: fieldErrors,
  }));
}
