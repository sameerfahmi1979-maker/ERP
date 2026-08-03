/**
 * HR.DOC_BROWSER.1 — shared client types for the 3-column document browser.
 */

export type BrowserEntitySelection = {
  type: "employee" | "employee_dependent";
  id: number;
  name: string;
  subtitle?: string;
};
