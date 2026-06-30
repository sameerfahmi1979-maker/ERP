"use client";

import { useState, useEffect, useCallback } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { RequiredLabel } from "@/components/erp/required-label";
import {
  Mail,
  KeyRound,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  Send,
  RefreshCw,
  XCircle,
} from "lucide-react";
import type { UserWithRoles } from "@/types/database";
import type { AuthContext } from "@/lib/rbac/check";
import {
  adminSendPasswordResetEmail,
  adminSetTemporaryPassword,
  adminForcePasswordChange,
  adminClearForcePasswordChange,
  adminConfirmUserEmail,
  adminSendWelcomeEmail,
  adminGenerateAndSendInviteEmail,
  getUserSecurityStatus,
  type UserSecurityStatus,
} from "@/server/actions/users/account-security";
import { passwordPolicySchema } from "@/lib/validation/auth";
import { useRouter } from "next/navigation";

const EMPTY = "—";

function fmt(ts: string | null | undefined): string {
  if (!ts) return EMPTY;
  try { return format(new Date(ts), "yyyy-MM-dd HH:mm"); } catch { return ts; }
}

type Props = {
  user: UserWithRoles;
  authContext?: AuthContext;
};

type TempPasswordDialogState = {
  open: boolean;
  password: string;
  passwordError: string | null;
  generating: boolean;
  generatedResult: string | null;
  submitting: boolean;
};

type ForceChangeDialogState = {
  open: boolean;
  reason: string;
  sendNotice: boolean;
  submitting: boolean;
};

export function SecuritySection({ user, authContext }: Props) {
  const router = useRouter();
  const canManageSecurity = authContext
    ? authContext.roleCodes.includes("system_admin") ||
      authContext.roleCodes.includes("group_admin") ||
      authContext.permissionCodes.includes("users.security.manage")
    : false;

  const [securityStatus, setSecurityStatus] = useState<UserSecurityStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);

  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    action: () => Promise<void>;
  }>({ open: false, title: "", description: "", action: async () => {} });

  const [tempPwd, setTempPwd] = useState<TempPasswordDialogState>({
    open: false,
    password: "",
    passwordError: null,
    generating: false,
    generatedResult: null,
    submitting: false,
  });

  const [forceChange, setForceChange] = useState<ForceChangeDialogState>({
    open: false,
    reason: "",
    sendNotice: false,
    submitting: false,
  });

  const loadStatus = useCallback(async () => {
    if (!canManageSecurity) return;
    setLoadingStatus(true);
    try {
      const result = await getUserSecurityStatus(user.id);
      if (result.success && result.data) setSecurityStatus(result.data);
    } finally {
      setLoadingStatus(false);
    }
  }, [user.id, canManageSecurity]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const runAction = async (label: string, fn: () => Promise<{ success: boolean; error?: string }>) => {
    const result = await fn();
    if (result.success) {
      toast.success(`${label} successful`);
      router.refresh();
      await loadStatus();
    } else {
      toast.error(result.error ?? `${label} failed`);
    }
  };

  const openConfirm = (title: string, description: string, action: () => Promise<void>) => {
    setConfirmDialog({ open: true, title, description, action });
  };

  // ── Temp password submit ─────────────────────────────────────────────────────
  const handleTempPasswordSubmit = async () => {
    const pwd = tempPwd.password.trim();
    if (pwd) {
      const result = passwordPolicySchema.safeParse(pwd);
      if (!result.success) {
        setTempPwd((p) => ({ ...p, passwordError: result.error.issues[0]?.message ?? "Invalid password" }));
        return;
      }
    }
    setTempPwd((p) => ({ ...p, submitting: true, passwordError: null }));
    const r = await adminSetTemporaryPassword(user.id, pwd || undefined);
    if (r.success) {
      const generated = r.data?.generatedPassword;
      if (generated) {
        setTempPwd((p) => ({ ...p, submitting: false, generatedResult: generated }));
      } else {
        toast.success("Temporary password set. User must change password on next login.");
        setTempPwd({ open: false, password: "", passwordError: null, generating: false, generatedResult: null, submitting: false });
        router.refresh();
        await loadStatus();
      }
    } else {
      toast.error(r.error ?? "Failed to set temporary password");
      setTempPwd((p) => ({ ...p, submitting: false }));
    }
  };

  const handleTempPasswordClose = () => {
    if (tempPwd.generatedResult) {
      toast.success("Temporary password set. User must change password on next login.");
      router.refresh();
      loadStatus();
    }
    setTempPwd({ open: false, password: "", passwordError: null, generating: false, generatedResult: null, submitting: false });
  };

  // ── Force change submit ──────────────────────────────────────────────────────
  const handleForceChangeSubmit = async () => {
    setForceChange((p) => ({ ...p, submitting: true }));
    const r = await adminForcePasswordChange(
      user.id,
      forceChange.reason.trim() || null,
      forceChange.sendNotice,
    );
    setForceChange((p) => ({ ...p, submitting: false }));
    if (r.success) {
      toast.success("Force password change set.");
      setForceChange({ open: false, reason: "", sendNotice: false, submitting: false });
      router.refresh();
      await loadStatus();
    } else {
      toast.error(r.error ?? "Failed to set force password change");
    }
  };

  const status = securityStatus ?? {
    must_change_password: (user as Record<string, unknown>).must_change_password as boolean ?? false,
    must_change_password_reason: (user as Record<string, unknown>).must_change_password_reason as string | null ?? null,
    password_changed_at: (user as Record<string, unknown>).password_changed_at as string | null ?? null,
    password_reset_sent_at: (user as Record<string, unknown>).password_reset_sent_at as string | null ?? null,
    password_set_by_admin_at: (user as Record<string, unknown>).password_set_by_admin_at as string | null ?? null,
    email_confirmed_by_admin_at: (user as Record<string, unknown>).email_confirmed_by_admin_at as string | null ?? null,
    last_password_security_action_at: (user as Record<string, unknown>).last_password_security_action_at as string | null ?? null,
    last_password_security_action: (user as Record<string, unknown>).last_password_security_action as string | null ?? null,
    auth_email: user.auth_metadata?.email ?? user.email ?? null,
    email_confirmed_at: user.auth_metadata?.email_confirmed_at ?? null,
    last_sign_in_at: user.auth_metadata?.last_sign_in_at ?? null,
    auth_created_at: user.auth_metadata?.auth_created_at ?? null,
    user_profile_id: user.id,
  };

  return (
    <div className="space-y-6">
      {/* Auth Info */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-6 space-y-1">
          <Label className="text-muted-foreground text-xs">Auth Email</Label>
          <div className="text-sm">{status.auth_email ?? EMPTY}</div>
        </div>
        <div className="col-span-6 space-y-1">
          <Label className="text-muted-foreground text-xs">Email Confirmed</Label>
          <div className="text-sm flex items-center gap-1">
            {status.email_confirmed_at ? (
              <><CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> {fmt(status.email_confirmed_at)}</>
            ) : (
              <><XCircle className="h-3.5 w-3.5 text-destructive" /> Not confirmed</>
            )}
          </div>
        </div>
        <div className="col-span-6 space-y-1">
          <Label className="text-muted-foreground text-xs">Last Sign-In</Label>
          <div className="text-sm">{status.last_sign_in_at ? fmt(status.last_sign_in_at) : "Never"}</div>
        </div>
        <div className="col-span-6 space-y-1">
          <Label className="text-muted-foreground text-xs">Auth Account Created</Label>
          <div className="text-sm">{fmt(status.auth_created_at)}</div>
        </div>
        <div className="col-span-12 space-y-1">
          <Label className="text-muted-foreground text-xs">Auth User ID</Label>
          <div className="text-xs font-mono text-muted-foreground truncate">{user.auth_user_id}</div>
        </div>
      </div>

      {/* Password Lifecycle */}
      <div className="rounded-md border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            Password Status
          </h4>
          {loadingStatus && <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />}
        </div>
        <div className="grid grid-cols-12 gap-4 text-sm">
          <div className="col-span-6 space-y-1">
            <Label className="text-muted-foreground text-xs">Must Change Password</Label>
            <div>
              {status.must_change_password ? (
                <Badge variant="destructive" className="text-xs">Required</Badge>
              ) : (
                <Badge variant="outline" className="text-xs text-green-600 border-green-300">No</Badge>
              )}
            </div>
          </div>
          {status.must_change_password && status.must_change_password_reason && (
            <div className="col-span-12 space-y-1">
              <Label className="text-muted-foreground text-xs">Reason</Label>
              <div className="text-sm text-muted-foreground">{status.must_change_password_reason}</div>
            </div>
          )}
          <div className="col-span-6 space-y-1">
            <Label className="text-muted-foreground text-xs">Password Changed At</Label>
            <div>{fmt(status.password_changed_at)}</div>
          </div>
          <div className="col-span-6 space-y-1">
            <Label className="text-muted-foreground text-xs">Reset Email Sent At</Label>
            <div>{fmt(status.password_reset_sent_at)}</div>
          </div>
          <div className="col-span-6 space-y-1">
            <Label className="text-muted-foreground text-xs">Set By Admin At</Label>
            <div>{fmt(status.password_set_by_admin_at)}</div>
          </div>
          <div className="col-span-6 space-y-1">
            <Label className="text-muted-foreground text-xs">Email Confirmed By Admin</Label>
            <div>{fmt(status.email_confirmed_by_admin_at)}</div>
          </div>
          <div className="col-span-6 space-y-1">
            <Label className="text-muted-foreground text-xs">Last Security Action</Label>
            <div className="text-xs">
              {status.last_password_security_action
                ? ({
                    admin_set_temp_password: "Admin Set Temporary Password",
                    password_reset_sent: "Password Reset Email Sent",
                    forced_change_set: "Force Change Enabled",
                    forced_change_cleared: "Force Change Cleared",
                    password_changed: "Password Changed by User",
                    email_confirmed_by_admin: "Email Confirmed by Admin",
                    welcome_email_sent: "Welcome Email Sent",
                    invite_email_sent: "Invite Email Sent",
                  }[status.last_password_security_action] ??
                  status.last_password_security_action.replace(/_/g, " "))
                : EMPTY}
            </div>
          </div>
          <div className="col-span-6 space-y-1">
            <Label className="text-muted-foreground text-xs">Last Security Action At</Label>
            <div>{fmt(status.last_password_security_action_at)}</div>
          </div>
        </div>
      </div>

      {/* Admin Actions */}
      {canManageSecurity && (
        <div className="rounded-md border p-4 space-y-4">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            Admin Security Actions
          </h4>

          {/* Password Management group */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Password Management
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => openConfirm(
                  "Send Reset Link",
                  `Send a password reset email to ${status.auth_email}? The link will expire in 1 hour.`,
                  async () => { await runAction("Send reset link", () => adminSendPasswordResetEmail(user.id)); }
                )}
              >
                <Mail className="h-3.5 w-3.5 mr-1.5" />
                Send Reset Link
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setTempPwd((p) => ({ ...p, open: true }))}
              >
                <KeyRound className="h-3.5 w-3.5 mr-1.5" />
                Set Temp Password
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setForceChange((p) => ({ ...p, open: true }))}
              >
                <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
                Force Password Change
              </Button>

              {status.must_change_password && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => openConfirm(
                    "Clear Force Password Change",
                    "Clear the force-password-change flag for this user? They will no longer be required to change password on next login.",
                    async () => { await runAction("Clear force change", () => adminClearForcePasswordChange(user.id)); }
                  )}
                >
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                  Clear Force Change
                </Button>
              )}
            </div>
          </div>

          {/* Email & Onboarding group */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Email &amp; Onboarding
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => openConfirm(
                  "Send Welcome Email with Credentials",
                  `This will generate a new temporary password, set it on the account, and email the login URL, username, and temporary password to ${status.auth_email}.\n\nThe user will be required to change their password on first login.\n\nProceed?`,
                  async () => { await runAction("Send welcome email", () => adminSendWelcomeEmail(user.id)); }
                )}
              >
                <Send className="h-3.5 w-3.5 mr-1.5" />
                Send Welcome Email
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => openConfirm(
                  "Send Invite Email",
                  `Generate a new invite link and send to ${status.auth_email}? Any previous invite links will be superseded.`,
                  async () => { await runAction("Send invite email", () => adminGenerateAndSendInviteEmail(user.id)); }
                )}
              >
                <Mail className="h-3.5 w-3.5 mr-1.5" />
                Send Invite Email
              </Button>

              {!status.email_confirmed_at && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => openConfirm(
                    "Mark Email Verified",
                    "Mark this user's email as verified? This confirms their account without requiring them to click an email link.",
                    async () => { await runAction("Mark email verified", () => adminConfirmUserEmail(user.id)); }
                  )}
                >
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                  Mark Email Verified
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* View-only locked message */}
      {!canManageSecurity && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground border rounded-md px-3 py-2.5 bg-muted/20">
          <KeyRound className="h-4 w-4 shrink-0" />
          <span>
            Security actions require the{" "}
            <code className="font-mono text-xs">users.security.manage</code> permission.
          </span>
        </div>
      )}

      {/* Confirm dialog */}
      <AlertDialog open={confirmDialog.open} onOpenChange={(open) => { if (!open) setConfirmDialog((d) => ({ ...d, open: false })); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmDialog.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async (e) => {
                e.preventDefault();
                await confirmDialog.action();
                setConfirmDialog((d) => ({ ...d, open: false }));
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Set Temp Password Dialog */}
      <ERPChildDialogForm
        open={tempPwd.open}
        onOpenChange={(open) => { if (!open) handleTempPasswordClose(); else setTempPwd((p) => ({ ...p, open: true })); }}
        title="Set Temporary Password"
        subtitle="User must change password on next login."
        icon={<KeyRound className="h-5 w-5" />}
        mode="edit"
        size="sm"
        isSubmitting={tempPwd.submitting}
        onSubmit={tempPwd.generatedResult ? handleTempPasswordClose : handleTempPasswordSubmit}
        submitLabel={tempPwd.generatedResult ? "Done" : "Set Password"}
        cancelLabel={tempPwd.generatedResult ? undefined : "Cancel"}
      >
        {tempPwd.generatedResult ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              A temporary password has been generated. Share it securely with the user. It will not be shown again.
            </p>
            <div className="rounded-md border bg-muted p-3 font-mono text-sm select-all">
              {tempPwd.generatedResult}
            </div>
            <p className="text-xs text-muted-foreground">
              The user must change this password on next login.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Leave blank to auto-generate a secure password. Must be 10+ chars with uppercase, lowercase, digit.
            </p>
            <div className="flex flex-col gap-2">
              <Label htmlFor="temp-password">Password (optional — leave blank to generate)</Label>
              <Input
                id="temp-password"
                type="password"
                autoComplete="new-password"
                placeholder="Leave blank to auto-generate"
                value={tempPwd.password}
                onChange={(e) => setTempPwd((p) => ({ ...p, password: e.target.value, passwordError: null }))}
              />
              {tempPwd.passwordError && (
                <p className="text-sm text-destructive">{tempPwd.passwordError}</p>
              )}
            </div>
          </div>
        )}
      </ERPChildDialogForm>

      {/* Force Password Change Dialog */}
      <ERPChildDialogForm
        open={forceChange.open}
        onOpenChange={(open) => { if (!open) setForceChange((p) => ({ ...p, open: false })); }}
        title="Force Password Change"
        subtitle="User will be required to change password on next login."
        icon={<AlertTriangle className="h-5 w-5" />}
        mode="edit"
        size="sm"
        isSubmitting={forceChange.submitting}
        onSubmit={handleForceChangeSubmit}
        submitLabel="Force Change"
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="force-reason">Reason (optional)</Label>
            <Textarea
              id="force-reason"
              placeholder="Security policy update, suspected compromise, etc."
              rows={3}
              value={forceChange.reason}
              onChange={(e) => setForceChange((p) => ({ ...p, reason: e.target.value }))}
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="send-notice"
              checked={forceChange.sendNotice}
              onCheckedChange={(v) => setForceChange((p) => ({ ...p, sendNotice: Boolean(v) }))}
            />
            <Label htmlFor="send-notice" className="text-sm font-normal cursor-pointer">
              Send email notification to user
            </Label>
          </div>
        </div>
      </ERPChildDialogForm>
    </div>
  );
}
