import type { PermissionDraftChange } from "./permission-command-center";

/** Memory drafts are untrusted input; preserve the originally reviewed baseline. */
export function parseCommandCenterDraft(raw: string): Map<string, PermissionDraftChange> {
  try {
    const values: unknown = JSON.parse(raw);
    if (!Array.isArray(values) || values.length > 1000) return new Map();
    const result = new Map<string, PermissionDraftChange>();
    for (const value of values) {
      if (!value || typeof value !== "object") return new Map();
      const c = value as Record<string, unknown>;
      if (!Number.isSafeInteger(c.permissionId) || Number(c.permissionId) <= 0 ||
          !Number.isSafeInteger(c.roleId) || Number(c.roleId) <= 0 ||
          typeof c.originalAssigned !== "boolean" ||
          c.action !== (c.originalAssigned ? "revoke" : "grant") ||
          typeof c.roleIsSystem !== "boolean" || typeof c.permissionIsSystem !== "boolean" ||
          ![c.permissionCode,c.permissionName,c.roleCode,c.roleName].every(x => typeof x === "string" && x.length <= 500)) return new Map();
      const key = `${c.permissionId}:${c.roleId}`;
      if (result.has(key)) return new Map();
      result.set(key, value as PermissionDraftChange);
    }
    return result;
  } catch { return new Map(); }
}
