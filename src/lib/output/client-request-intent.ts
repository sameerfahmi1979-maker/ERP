/** Only non-secret request tokens/hashes, never wording, employee data, images,
 * passwords or form inputs. Session-scoped and retired at identity boundaries. */
const PREFIX = "algt-f08-output-intent-v1:";
type Intent = { token: string; command: string; created: number };
async function digest(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}
async function family(owner: string, employeeId: number, outputCode: string) { return PREFIX + await digest(JSON.stringify([owner, employeeId, outputCode])); }
function read(key: string): Intent | null {
  const value = sessionStorage.getItem(key); if (!value) return null;
  let parsed: Intent; try { parsed = JSON.parse(value); } catch { throw Error("Saved request identity is invalid. Reconcile its history before starting another request."); }
  if (!/^[a-f0-9-]{36}$/.test(parsed.token) || !/^[a-f0-9]{64}$/.test(parsed.command) || !Number.isFinite(parsed.created)) throw Error("Saved request identity requires reconciliation.");
  return parsed;
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
export async function getOutputRequestIntent(owner: string, employeeId: number, outputCode: string, command: unknown, admits: () => boolean = () => true) {
  const key = await family(owner, employeeId, outputCode), hash = await digest(JSON.stringify(canonical(command)));
  if (!admits()) throw Error("This request belongs to a retired account or screen.");
  const prior = read(key);
  if (prior && prior.command !== hash) throw Error("An earlier request is unconfirmed. Recover its original from Issued Documents before changing the entries.");
  const intent = prior ?? { token: crypto.randomUUID(), command: hash, created: Date.now() };
  if (!prior) sessionStorage.setItem(key, JSON.stringify(intent));
  return { key, token: intent.token };
}
export function settleOutputRequestIntent(key: string, token: string) {
  if (read(key)?.token === token) sessionStorage.removeItem(key);
}
export async function settleRecoveredOutputIntent(owner: string, employeeId: number, outputCode: string, actorId: number, requestKey: string) {
  const key = await family(owner, employeeId, outputCode), intent = read(key); if (!intent) return;
  const expected = "req_" + (await digest(`${outputCode}|${employeeId}|${actorId}|${intent.token}`)).slice(0, 48);
  if (expected === requestKey) settleOutputRequestIntent(key, intent.token);
}
export function retireOutputRequestIntents() {
  try { for (const key of Object.keys(sessionStorage)) if (key.startsWith(PREFIX)) sessionStorage.removeItem(key); } catch { /* No in-memory business payload exists to retain. */ }
}
