import "server-only";
import { getAdminConfig, getPdfTransportConfig } from "@/lib/config/server-features";

const BUCKETS = ["dms-documents", "dms-temp", "erp-generated-pdfs", "erp-branding-assets"];
const CHECKS = ["auth", "schema", "storage", "renderer"] as const;
type Check = typeof CHECKS[number];

/** Dependency admission only. Worker, provider, restore and load acceptance are separate. */
export async function checkStartupReadiness(env = process.env, request = fetch) {
  const signal = AbortSignal.timeout(3_000);
  const read = async (url: string, headers: HeadersInit, validate?: (value: unknown) => boolean) => {
    try {
      const response = await request(url, { headers, cache: "no-store", redirect: "error", signal });
      if (validate && response.ok) return validate(await response.json());
      void response.body?.cancel().catch(() => {});
      return response.ok;
    } catch { return false; }
  };
  let auth = Promise.resolve(false), schema = Promise.resolve(false), storage = Promise.resolve(false);
  let renderer = Promise.resolve(false);
  try {
    const { url, serviceKey } = getAdminConfig(env);
    const publicKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
    if (publicKey) auth = read(`${url}/auth/v1/health`, { apikey: publicKey });
    const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Accept: "application/json" };
    const revisions = read(`${url}/rest/v1/rpc/phase3_report_source_generations`, headers, value => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return false;
      const versions = value as Record<string, unknown>;
      return ["employees", "work_sites", "employee_access_cards", "hr_candidates"].every(key => typeof versions[key] === "string" && /^\d+$/.test(versions[key]));
    });
    const catalogue = read(`${url}/rest/v1/designations?select=id,workspace_revision&limit=0`, headers, Array.isArray);
    schema = Promise.all([revisions, catalogue]).then(results => results.every(Boolean));
    storage = Promise.all(BUCKETS.map(id => read(`${url}/storage/v1/bucket/${id}`, headers, value =>
      !!value && typeof value === "object" && "id" in value && value.id === id && "public" in value && value.public === false))).then(results => results.every(Boolean));
  } catch { /* Missing credentials or invalid origin are startup failures. */ }
  try { renderer = read(`${getPdfTransportConfig(env).rendererUrl}/health`, {}); } catch { /* Required renderer is unconfigured. */ }
  const results = await Promise.all([auth, schema, storage, renderer]);
  const checks = Object.fromEntries(CHECKS.map((key, index) => [key, results[index] ? "ok" : "unavailable"])) as Record<Check, "ok" | "unavailable">;
  return { ready: results.every(Boolean), checks };
}
