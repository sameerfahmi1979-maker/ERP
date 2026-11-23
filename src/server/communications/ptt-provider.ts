import 'server-only';
import { z } from 'zod';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const mid = z.string().regex(/^[A-Za-z0-9_-]{1,32}$/);
const track = z.object({ mid, trackName: z.string().max(128).optional() });
const sdp = z.strictObject({ type: z.enum(['offer', 'answer']), sdp: z.string().min(4).max(65536) });
const common = { epoch: z.uuid(), channelId: z.uuid(), signalId: z.uuid().optional() };
export const signalArgs = z.discriminatedUnion('action', [
  z.strictObject({ ...common, action: z.literal('open') }),
  z.strictObject({ ...common, action: z.literal('publish'), endpointId: z.uuid(), leaseId: z.uuid(), mid, sessionDescription: sdp.extend({ type: z.literal('offer') }) }),
  z.strictObject({ ...common, action: z.literal('subscribe'), endpointId: z.uuid(), leaseId: z.uuid() }),
  z.strictObject({ ...common, action: z.literal('answer'), endpointId: z.uuid(), leaseId: z.uuid(), sessionDescription: sdp.extend({ type: z.literal('answer') }) }),
]);
export type SignalArgs = z.infer<typeof signalArgs>;
export const planShape = z.object({
  endpointId: z.uuid(), token: z.uuid(), sessionId: id.nullable(), publisherSessionId: id.nullable(), trackName: id.nullable(),
});
type Plan = z.infer<typeof planShape>;
type Description = z.infer<typeof sdp>;
type ProviderResult = { sessionId?: string; mid?: string; sessionDescription?: Description; tracks?: z.infer<typeof track>[]; requiresImmediateRenegotiation?: boolean };
type Config = { appId: string; secret: string };
export function providerConfig(env: Readonly<Record<string, string | undefined>> = process.env): Config | null {
  const appId = env.ERP_COMM_SFU_APP_ID;
  const secret = env.ERP_COMM_SFU_APP_SECRET;
  return id.safeParse(appId).success && secret && /^[\x21-\x7e]{16,1024}$/.test(secret) ? { appId: appId!, secret } : null;
}

function requireAudio(description: Description) {
  const media = description.sdp.split(/\r?\n/).filter(line => line.startsWith('m='));
  if (!description.sdp.startsWith('v=0') || media.length !== 1 || !media[0].startsWith('m=audio ')) throw Error('Invalid audio negotiation');
}

export class CloudflarePtt {
  constructor(private readonly config: Config, private readonly transport: typeof fetch = fetch, private readonly deadline?: AbortSignal) { }

  private async request(method: string, path: string, body?: unknown) {
    const response = await this.transport(`https://rtc.live.cloudflare.com/v1/apps/${this.config.appId}/${path}`, {
      method, cache: 'no-store', redirect: 'error', signal: this.deadline ? AbortSignal.any([this.deadline,AbortSignal.timeout(6500)]) : AbortSignal.timeout(6500),
      headers: { Authorization: `Bearer ${this.config.secret}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw Error('SFU request unavailable');
    const raw: unknown = await response.json();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || 'errorCode' in raw || 'errorDescription' in raw) throw Error('SFU operation unavailable');
    return raw as Record<string, unknown>;
  }

  async signal(args: SignalArgs, plan: Plan): Promise<ProviderResult> {
    if (args.action === 'open') {
      return { sessionId: id.parse((await this.request('POST', 'sessions/new')).sessionId) };
    }
    const session = id.parse(plan.sessionId);
    if (args.action === 'answer') {
      requireAudio(args.sessionDescription);
      await this.request('PUT', `sessions/${session}/renegotiate`, { sessionDescription: args.sessionDescription });
      return {};
    }
    const publishing = args.action === 'publish';
    if (publishing) requireAudio(args.sessionDescription);
    const trackName = id.parse(plan.trackName);
    const requested = publishing ? { location: 'local', mid: args.mid, trackName }
      : { location: 'remote', sessionId: id.parse(plan.publisherSessionId), trackName };
    const data = await this.request('POST', `sessions/${session}/tracks/new`, {
      tracks: [requested], ...(publishing ? { sessionDescription: args.sessionDescription } : {}),
    });
    const returned = z.array(z.object({ errorCode: z.never().optional(), errorDescription: z.never().optional() }).and(track)).length(1).parse(data.tracks)[0];
    if ((returned.trackName !== undefined && returned.trackName !== trackName) || (publishing && returned.mid !== args.mid)) throw Error('Mismatched SFU track');
    if ((!publishing && data.requiresImmediateRenegotiation !== true) || (publishing && data.requiresImmediateRenegotiation === true)) {
      throw Error('Unexpected SFU renegotiation');
    }
    const negotiated = sdp.parse(data.sessionDescription);
    if (negotiated.type !== (publishing ? 'answer' : 'offer')) throw Error('Invalid SDP response');
    requireAudio(negotiated);
    return {
      mid: returned.mid, tracks: [{ mid: returned.mid, trackName }], sessionDescription: negotiated,
      requiresImmediateRenegotiation: data.requiresImmediateRenegotiation === true
    };
  }

  private async activeTracks(session: string): Promise<string[]> {
    const inspected = await this.request('GET', `sessions/${session}`);
    const state = z.array(z.object({ mid, status: z.enum(['active', 'inactive']) })).parse(inspected.tracks);
    return state.filter(item => item.status === 'active').map(item => item.mid);
  }

  /** No new track can be added to this one-track endpoint once the DB marks it dirty. */
  async close(sessionId: string, trackMid: string | null): Promise<void> {
    const session = id.parse(sessionId);
    const active = await this.activeTracks(session);
    if (!active.length) return;
    if (trackMid !== null && (active.length !== 1 || active[0] !== mid.parse(trackMid))) throw Error('Unrecognized SFU track');
    const data = await this.request('PUT', `sessions/${session}/tracks/close`, { force: true, tracks: active.map(mid => ({ mid })) });
    const closed = z.array(z.object({ mid, errorCode: z.never().optional(), errorDescription: z.never().optional() })).parse(data.tracks);
    if (closed.length !== active.length || !active.every(name => closed.some(item => item.mid === name))) throw Error('Unconfirmed SFU closure');
    if ((await this.activeTracks(session)).length) throw Error('SFU track still active');
  }
}
