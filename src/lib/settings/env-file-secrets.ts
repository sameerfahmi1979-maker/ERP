import "server-only";

import fs from "fs";
import path from "path";

/**
 * ERP SETTINGS — server-side env file secret writer.
 *
 * Persists an API key to the server's `.env.local` file and applies it to the
 * running process immediately (no restart required).
 *
 * Security invariants (per erp-ai-settings-standard):
 *  - The key is NEVER written to the database.
 *  - The key is NEVER logged.
 *  - Callers must enforce the `settings.ai.secrets.manage` permission BEFORE calling.
 *
 * Note: works for self-hosted Node deployments where the app has write access
 * to its project root. On read-only hosts (e.g. serverless), the file write
 * fails and an error is returned; the env var must then be set on the host.
 */

const ENV_FILE = ".env.local";

function isValidEnvVarName(name: string): boolean {
  return /^[A-Z][A-Z0-9_]*$/.test(name);
}

/** Quote the value if it contains characters that would break dotenv parsing. */
function serializeEnvValue(value: string): string {
  if (/[\s#'"\\]/.test(value)) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return value;
}

export function writeEnvSecret(
  envVarName: string,
  secretValue: string
): { success: boolean; error?: string } {
  if (!isValidEnvVarName(envVarName)) {
    return {
      success: false,
      error: "Invalid environment variable name. Use uppercase letters, digits and underscores.",
    };
  }
  if (!secretValue.trim()) {
    return { success: false, error: "Secret value is empty." };
  }
  if (/^https?:\/\//i.test(secretValue.trim())) {
    return {
      success: false,
      error: "The value looks like a URL. Paste the API key (e.g. KEY 1 from Azure Portal), not the endpoint. The endpoint belongs in the API Endpoint field.",
    };
  }

  const envPath = path.join(process.cwd(), ENV_FILE);
  const newLine = `${envVarName}=${serializeEnvValue(secretValue.trim())}`;

  try {
    let content = "";
    if (fs.existsSync(envPath)) {
      content = fs.readFileSync(envPath, "utf8");
    }

    const lines = content.split(/\r?\n/);
    const prefix = `${envVarName}=`;
    let replaced = false;

    const updated = lines.map((line) => {
      if (line.trimStart().startsWith(prefix)) {
        replaced = true;
        return newLine;
      }
      return line;
    });

    if (!replaced) {
      // Append at end, ensuring we don't create a blank gap
      while (updated.length > 0 && updated[updated.length - 1].trim() === "") {
        updated.pop();
      }
      updated.push(newLine);
    }

    fs.writeFileSync(envPath, updated.join("\n") + "\n", { encoding: "utf8", mode: 0o600 });

    // Apply immediately to the running process so no restart is needed
    process.env[envVarName] = secretValue.trim();

    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: `Could not write to ${ENV_FILE}: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
