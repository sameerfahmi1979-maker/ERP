import "server-only";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { isAllowedAiSecretReference } from "./ai-secret-policy";

/** Opt-in self-hosted single-process writer. Managed/multi-replica deployments must
 * rotate through their deployment secret store. Never logs or returns raw keys.
 * Atomic file replacement, exclusive lock and compensation on metadata failure.
 */
export async function writeAiProviderSecret(
  input: { providerType: string; providerId: number; secretRef: string; secretValue: string },
  persistReference: () => Promise<boolean>,
): Promise<{ success: boolean; error?: string }> {
  const { providerType, providerId, secretRef, secretValue } = input;
  if (!isAllowedAiSecretReference(providerType, providerId, secretRef)) return { success: false, error: "Secret reference is not approved for this provider." };
  const value = secretValue.trim();
  // Approved provider keys are opaque ASCII tokens. Reject dotenv expansion,
  // quoting and multiline syntax so the restarted process reads the same key.
  if (!/^[A-Za-z0-9._~+/=:!-]+$/.test(value) || /^https?:\/\//i.test(value)) return { success: false, error: "Enter an API key token, without whitespace, quotes or an endpoint." };
  if (process.env.AI_SECRET_FILE_WRITES_ENABLED !== "true") return { success: false, error: "Server-file secret updates are disabled. Ask the deployment administrator to rotate the approved provider key in the managed environment." };
  const file = path.join(process.cwd(), ".env.local");
  const lock = file + ".ai-secret.lock";
  const temporary = file + "." + randomUUID() + ".tmp";
  let descriptor: number | undefined;
  let oldContent: Buffer | undefined;
  let replaced = false;
  try {
    descriptor = fs.openSync(lock, "wx", 0o600);
    if (fs.existsSync(file)) oldContent = fs.readFileSync(file);
    const serialized = JSON.stringify(value);
    const matcher = new RegExp(`^\\s*(?:export\\s+)?${secretRef}\\s*=`);
    const lines = (oldContent?.toString("utf8") ?? "").split(/\r?\n/).filter(line => !matcher.test(line));
    lines.push(`${secretRef}=${serialized}`);
    fs.writeFileSync(temporary, lines.join("\n") + "\n", { mode: 0o600, flag: "wx" });
    fs.renameSync(temporary, file);
    replaced = true;
    if (!(await persistReference())) throw new Error("Metadata persistence failed");
    process.env[secretRef] = value;
    return { success: true };
  } catch {
    if (replaced) {
      try {
        if (oldContent !== undefined) {
          fs.writeFileSync(temporary, oldContent, { mode: 0o600 });
          fs.renameSync(temporary, file);
        } else fs.unlinkSync(file);
      } catch {
        return { success: false, error: "Secret update failed and file recovery needs administrator attention. Do not retry until the provider reference and server environment have been reconciled." };
      }
    }
    return { success: false, error: "Secret update did not complete. The running key was not changed; verify the provider reference before retrying." };
  } finally {
    if (descriptor !== undefined) {
      fs.closeSync(descriptor);
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
      fs.unlinkSync(lock);
    }
  }
}
