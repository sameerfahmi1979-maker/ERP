/**
 * Safe notification template renderer.
 * {{variable_name}} placeholder syntax — no eval, no arbitrary code.
 * Exported as a plain utility (not a server action) so it can be used
 * from both server and client contexts.
 */

/** Replace {{variable}} placeholders with values from the variables map. */
export function renderTemplate(
  template: string,
  variables: Record<string, string>
): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, key: string) => {
    const k = key.trim();
    return k in variables ? variables[k] : `{{${k}}}`;
  });
}
