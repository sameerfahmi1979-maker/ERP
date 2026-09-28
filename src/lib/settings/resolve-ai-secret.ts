import "server-only";
import type { AiProviderConfig } from "@/lib/ai/providers/types";
import { isAllowedAiSecretReference } from "./ai-secret-policy";

/** Treat persisted secret references as untrusted configuration too. */
export function resolveAiProviderSecret(config: Pick<AiProviderConfig, "id" | "providerType" | "secretRef">): string | undefined {
  const ref = config.secretRef;
  if (!ref || !isAllowedAiSecretReference(config.providerType, config.id, ref)) return undefined;
  return process.env[ref];
}
