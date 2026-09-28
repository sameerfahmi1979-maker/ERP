/** Safe, allowlisted feedback. Never return or log the provider's raw message. */
export function passwordRejectionFeedback(error: { code?: string; status?: number; reasons?: unknown }) {
  if (error.code === "same_password") return {
    category: "same_password", requiresFreshSignIn: false,
    message: "Your new password must be different from your current password. Your password has not changed.",
  };
  if (error.code === "weak_password") {
    const leaked = Array.isArray(error.reasons) && error.reasons.includes("pwned");
    return {
      category: leaked ? "leaked_password" : "weak_password", requiresFreshSignIn: false,
      message: leaked
        ? "This password appears in known data breaches. Choose a unique password you have not used elsewhere. Your password has not changed."
        : "Choose a stronger password: at least 10 characters with uppercase, lowercase and a digit. Avoid common or previously exposed passwords. Your password has not changed.",
    };
  }
  if (error.code === "reauthentication_needed" || error.code === "reauthentication_not_valid") return {
    category: "reauthentication_required", requiresFreshSignIn: true,
    message: "For your security, sign in again before choosing a new password. Your password has not changed.",
  };
  if (["session_expired", "session_not_found", "bad_jwt", "no_authorization"].includes(error.code ?? "") || error.status === 401) return {
    category: "session_expired", requiresFreshSignIn: true,
    message: "Your sign-in session is no longer valid. Sign in again or request a new password-reset link. Your password has not changed.",
  };
  if (error.code === "over_request_rate_limit" || error.status === 429) return {
    category: "rate_limited", requiresFreshSignIn: false,
    message: "Too many password-change attempts. Wait a few minutes before trying again. Your password has not changed.",
  };
  return {
    category: "provider_rejected", requiresFreshSignIn: false,
    message: "The password service rejected this change. Your password has not changed. Contact your administrator if this continues.",
  };
}
