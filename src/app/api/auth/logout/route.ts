import { signOut } from "@/features/auth/actions";
import { authResponse, isSameOriginAuthRequest } from "@/lib/auth/http-boundary";

/** No user ID or scope is accepted: revoke only this browser's current session. */
export async function POST(request: Request) {
  if (!isSameOriginAuthRequest(request)) return authResponse(false, 403);
  return authResponse((await signOut()).success);
}
