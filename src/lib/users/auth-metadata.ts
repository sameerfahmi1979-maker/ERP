import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

/** Safe auth fields exposed to authorized admins only — never include secrets or raw identities. */
export type SafeUserAuthMetadata = {
  email: string | null;
  last_sign_in_at: string | null;
  auth_created_at: string | null;
  // USERS.2A
  email_confirmed_at: string | null;
};

const CONCURRENCY = 8;

/**
 * Fetch minimal auth metadata for one user by auth UUID.
 * Server-only — requires caller to enforce users.view permission.
 */
export async function getSafeAuthMetadataByAuthUserId(
  authUserId: string,
): Promise<SafeUserAuthMetadata | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.getUserById(authUserId);
    if (error || !data.user) {
      if (error) logger.warn("getSafeAuthMetadataByAuthUserId", error.message);
      return null;
    }
    return {
      email: data.user.email ?? null,
      last_sign_in_at: data.user.last_sign_in_at ?? null,
      auth_created_at: data.user.created_at ?? null,
      email_confirmed_at: data.user.email_confirmed_at ?? null,
    };
  } catch (err) {
    logger.error("getSafeAuthMetadataByAuthUserId exception", err);
    return null;
  }
}

/**
 * Batch-fetch safe auth metadata for a page of user profiles.
 */
export async function batchSafeAuthMetadata(
  authUserIds: string[],
): Promise<Map<string, SafeUserAuthMetadata>> {
  const result = new Map<string, SafeUserAuthMetadata>();
  const uniqueIds = [...new Set(authUserIds.filter(Boolean))];

  for (let i = 0; i < uniqueIds.length; i += CONCURRENCY) {
    const chunk = uniqueIds.slice(i, i + CONCURRENCY);
    const entries = await Promise.all(
      chunk.map(async (id) => {
        const meta = await getSafeAuthMetadataByAuthUserId(id);
        return meta ? ([id, meta] as const) : null;
      }),
    );
    for (const entry of entries) {
      if (entry) result.set(entry[0], entry[1]);
    }
  }

  return result;
}

/**
 * Find auth user IDs whose email matches a search substring (case-insensitive).
 * Used for server-side email search — acceptable at current scale; revisit if user count grows large.
 */
export async function findAuthUserIdsByEmailSearch(search: string): Promise<string[]> {
  const term = search.trim().toLowerCase();
  if (!term.includes("@")) return [];

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error || !data.users) {
      if (error) logger.warn("findAuthUserIdsByEmailSearch", error.message);
      return [];
    }
    return data.users
      .filter((u) => u.email?.toLowerCase().includes(term))
      .map((u) => u.id);
  } catch (err) {
    logger.error("findAuthUserIdsByEmailSearch exception", err);
    return [];
  }
}
