export type WorkspaceFieldIssue = {
  control: HTMLElement | null;
  label: string;
  message: string;
  section: string | null;
};

/** Custom widgets opt in with data-workspace-field on their focusable trigger. */
export function resolveWorkspaceFieldIssues(form: HTMLFormElement, errors: Record<string, string>): WorkspaceFieldIssue[] {
  return Object.entries(errors).map(([field, message]) => {
    const candidates = Array.from(form.querySelectorAll<HTMLElement>("[name],[data-workspace-field]"));
    const control = candidates.find(el => el.dataset.workspaceField === field)
      ?? candidates.find(el => el.getAttribute("name") === field && !(el instanceof HTMLInputElement && el.type === "hidden"))
      ?? null;
    const label = (control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)
      ? control.labels?.[0]?.textContent?.replace(/\s*\*\s*$/, "").trim() : undefined;
    return { control, label: label || control?.getAttribute("aria-label") || field.replaceAll("_", " "), message,
      section: control?.closest<HTMLElement>("[data-workspace-section]")?.dataset.workspaceSection ?? null };
  });
}

/** Read validity without reportValidity(): hidden section fields must be revealed first. */
export function collectWorkspaceFieldIssues(form: HTMLFormElement | HTMLElement): WorkspaceFieldIssue[] {
  const controls = form instanceof HTMLFormElement ? form.elements : form.querySelectorAll("input,select,textarea");
  const nativeIssues: WorkspaceFieldIssue[] = Array.from(controls).flatMap(control => {
    if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)) return [];
    if (!control.willValidate || control.validity.valid) return [];
    const label = control.labels?.[0]?.textContent?.replace(/\s*\*\s*$/, "").trim()
      || control.getAttribute("aria-label") || control.name.replaceAll("_", " ") || "Field";
    // Browser validationMessage can echo the entered value (including private
    // contact data). Keep shared summaries value-free and consistent in English.
    const validity = control.validity;
    const message = validity.valueMissing ? "This field is required."
      : validity.typeMismatch && control instanceof HTMLInputElement && control.type === "email" ? "Enter a valid email address."
      : validity.typeMismatch ? "Enter a valid value."
      : validity.rangeOverflow || validity.rangeUnderflow ? "Enter a value within the allowed range."
      : validity.stepMismatch || validity.badInput ? "Enter a valid number."
      : validity.tooLong || validity.tooShort ? "Check the required length."
      : "Check the required format.";
    return [{ control, label, message,
      section: control.closest<HTMLElement>("[data-workspace-section]")?.dataset.workspaceSection ?? null }];
  });
  const customIssues: WorkspaceFieldIssue[] = Array.from(form.querySelectorAll<HTMLElement>('[data-workspace-required="true"][data-workspace-empty="true"]'))
    .filter(control => control.getAttribute("aria-disabled") !== "true" && !control.matches(":disabled"))
    .map(control => ({control, label:control.getAttribute("aria-label") || control.dataset.workspaceField?.replaceAll("_", " ") || "Field",
      message:"This field is required.", section:control.closest<HTMLElement>("[data-workspace-section]")?.dataset.workspaceSection ?? null}));
  return [...nativeIssues, ...customIssues].sort((a,b) => !a.control || !b.control ? 0 : a.control.compareDocumentPosition(b.control) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
}
