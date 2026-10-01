import 'server-only';
import { timingSafeEqual } from 'node:crypto';

/** Runtime, machine-only gate. Does not read a browser session or log secrets. */
export function authorizeWorker(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 32 || secret.length > 256 || secret.trim() !== secret || !authorization?.startsWith('Bearer ')) return false;
  if (authorization.length !== secret.length + 7) return false;
  const supplied=Buffer.from(authorization.slice(7)), expected=Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
