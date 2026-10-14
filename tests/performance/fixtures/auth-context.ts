import type {AuthContext} from "@/lib/rbac/check";
import type {UserProfile} from "@/types/domain";

type SyntheticAuthContext = AuthContext & {profile: UserProfile; globalPermissionCodes: string[]};

/** Complete, synthetic-only principal. No live identity, token or database read. */
export function syntheticAuthContext(permissionCodes: string[] = [], profile: Partial<UserProfile> = {}): SyntheticAuthContext {
  return {
    profile: {
      id: 1, auth_user_id: "synthetic-1", avatar_url: null, branch_id: null,
      created_at: "2026-10-01T00:00:00Z", department: null, display_name: null,
      email_confirmed_by_admin_at: null, email_confirmed_by_admin_id: null,
      employee_reference: null, full_name: null, job_title: null, last_admin_updated_at: null,
      last_password_security_action: null, last_password_security_action_at: null,
      last_password_security_action_by: null, manager_user_profile_id: null,
      must_change_password: false, must_change_password_reason: null, notes: null,
      owner_company_id: null, password_changed_at: null, password_reset_sent_at: null,
      password_set_by_admin_at: null, phone: null, preferred_language: null,
      status: "active", timezone: null, updated_at: "2026-10-01T00:00:00Z", user_code: null,
      ...profile,
    },
    email: null, roleCodes: [], permissionCodes: [...permissionCodes],
    globalPermissionCodes: [...permissionCodes], roleAssignments: [],
    accountStatus: "active", isAccountActive: true,
  };
}
