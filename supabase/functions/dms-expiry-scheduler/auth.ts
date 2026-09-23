/** Mandatory machine authentication, also used when the Edge JWT gateway is off. */
export async function schedulerGate(req: Request, secret: string | undefined): Promise<Response | null> {
  const json = (status: number, error: string) => Response.json({ error }, { status });
  if (req.method !== 'POST') return json(405, 'Method not allowed');
  if (!secret || secret.length < 32 || secret.length > 256 || secret.trim() !== secret) {
    return json(503, 'Scheduler authentication is not configured');
  }
  const supplied = req.headers.get('x-dms-scheduler-secret');
  if (!supplied || supplied.length < 32 || supplied.length > 256) return json(401, 'Unauthorized');
  // Hash fixed-size inputs before comparison; never log credentials or echo them.
  const encode = new TextEncoder();
  const [expected, actual] = await Promise.all([secret, supplied].map(value =>
    crypto.subtle.digest('SHA-256', encode.encode(value)).then(value => new Uint8Array(value))));
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) mismatch |= expected[i] ^ actual[i];
  return mismatch === 0 ? null : json(401, 'Unauthorized');
}
