/** Wait for the complete response before callers discard the document and its caches. */
export async function signOut(): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch("/api/auth/logout", {
      method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error",
    });
    const result: unknown = await response.json();
    if (response.ok && result && typeof result === "object" && "success" in result && result.success === true)
      return { success: true };
  } catch { /* Unknown outcomes must not pretend the server session was revoked. */ }
  return { success: false, error: "Sign out could not be confirmed. Please retry." };
}
