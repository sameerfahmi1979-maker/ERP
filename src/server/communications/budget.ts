import 'server-only';
import { z } from 'zod';
import type { CommunicationActor } from './access';
import type { CommunicationCommand } from './contracts';
import { createAdminClient } from '@/lib/supabase/admin';
import { communicationFeatureEnabled, communicationFeatures, type CommunicationFeature } from './providers/config';

export type { CommunicationFeature };
export type ReservationRequest = {
  feature: CommunicationFeature;
  operationId: string;
  binding?: { actorSessionId: string; command: Record<string, unknown> };
  actorId: string;
  scope: string;
  upperBoundMicros: bigint;
  /** Includes operational, retry and drain exposure. Null signals continuing retention. */
  liabilityEndsAt: Date | null;
};
export type SettlementRequest = Pick<ReservationRequest, 'scope' | 'feature' | 'operationId'> & {
  permitId: string;
  actualMicros: bigint;
  evidenceId: string;
};
type Denied = { ok: false; status: 503; reason: string };
const exportSpool = z.strictObject({
  bytesPerSlot: z.string().regex(/^[1-9][0-9]{0,18}$/),
  slotsPerVolume: z.number().int().positive(), maxVolumes: z.number().int().positive(),
  cleanupTailSeconds: z.number().int().positive(),
});
export type BudgetResult = Denied | {
  ok: true; permitId: string; expiresAt: Date; newReservation: boolean;
  spool?: z.infer<typeof exportSpool>;
};
type UpdateResult = Denied | { ok: true };
const denied = (reason: string): Denied => ({ ok: false, status: 503, reason });
type Command = 'reserve' | 'settle' | 'pause' | 'bind_cleanup' | 'authorize_cleanup' | 'confirm_cleanup';

/** Each command is one atomic transaction on the persistent approval/operation ledger. */
export interface CommunicationBudgetStore {
  transact(command: Command, payload: Record<string, unknown>): Promise<unknown>;
}
export type BudgetDependencies = { store?: CommunicationBudgetStore; env?: Readonly<Record<string, string | undefined>> };

const persistentStore: CommunicationBudgetStore = {
  async transact(command, payload) {
    const { data, error } = await createAdminClient().rpc('erp_comm_budget_command', {
      p_command: command, p_payload: payload,
    });
    if (error) throw Error('Budget ledger unavailable');
    return data;
  },
};

function validId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 256 && value.trim().length > 0;
}
function amount(value: unknown): value is bigint {
  return typeof value === 'bigint' && value >= BigInt(0) && value.toString().length <= 30;
}
function validKey(key: Pick<ReservationRequest, 'feature' | 'scope' | 'operationId'>): boolean {
  return communicationFeatures.includes(key.feature) && validId(key.scope) && validId(key.operationId);
}

async function execute(command: Command, payload: Record<string, unknown>, deps: BudgetDependencies) {
  try {
    const response = await (deps.store ?? persistentStore).transact(command, payload);
    if (typeof response !== 'object' || response === null || !('ok' in response)) return denied('invalid_budget_response');
    if (response.ok === true) return { ok: true as const, data: response };
    const reason = 'reason' in response ? response.reason : null;
    return denied(typeof reason === 'string' && /^[a-z_]{1,64}$/.test(reason) ? reason : 'budget_held');
  } catch {
    return denied('budget_transaction_unavailable');
  }
}

export async function reserveCommunicationBudget(
  request: ReservationRequest, dependencies: BudgetDependencies = {},
): Promise<BudgetResult> {
  if (!validKey(request) || !validId(request.actorId) || !amount(request.upperBoundMicros) ||
      (request.liabilityEndsAt !== null && (!(request.liabilityEndsAt instanceof Date) ||
        !Number.isFinite(request.liabilityEndsAt.getTime())))) return denied('invalid_reservation');
  if (!communicationFeatureEnabled(request.feature, dependencies.env)) return denied('feature_disabled');
  const hostDeploymentId = (dependencies.env ?? process.env).RAILWAY_DEPLOYMENT_ID;
  if (hostDeploymentId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(hostDeploymentId))
    return denied('invalid_host_deployment');
  const serverRequest = { ...request } as ReservationRequest & { hostDeploymentId?: unknown };
  delete serverRequest.hostDeploymentId;
  const result = await execute('reserve', {
    ...serverRequest, ...(hostDeploymentId ? { hostDeploymentId: hostDeploymentId.toLowerCase() } : {}),
    upperBoundMicros: request.upperBoundMicros.toString(),
    liabilityEndsAt: request.liabilityEndsAt?.toISOString() ?? null,
  }, dependencies);
  if (!result.ok) return result;
  const data = result.data;
  if (!('permitId' in data) || !validId(data.permitId) || !('expiresAt' in data) ||
      typeof data.expiresAt !== 'string' || !('newReservation' in data) ||
      typeof data.newReservation !== 'boolean') return denied('invalid_budget_response');
  const expiresAt = new Date(data.expiresAt);
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) return denied('permit_expired');
  const permit = { ok: true as const, permitId: data.permitId, expiresAt, newReservation: data.newReservation };
  if (request.feature === 'export') {
    const spool = exportSpool.safeParse('spool' in data ? data.spool : null);
    return spool.success ? { ...permit, spool: spool.data } : denied('export_spool_lifetime_unproven');
  }
  return permit;
}

/** Final provider evidence is recorded independently and matched by the persistent transaction. */
export async function reconcileCommunicationBudget(
  input: SettlementRequest, dependencies: BudgetDependencies = {},
): Promise<UpdateResult> {
  if (!validKey(input) || !validId(input.permitId) || !validId(input.evidenceId) || !amount(input.actualMicros)) {
    return denied('invalid_settlement');
  }
  const result = await execute('settle', { ...input, actualMicros: input.actualMicros.toString() }, dependencies);
  return result.ok ? { ok: true } : result;
}

export async function pauseCommunicationBudget(
  feature: CommunicationFeature, scope: string, reason: string, dependencies: BudgetDependencies = {},
): Promise<UpdateResult> {
  if (!communicationFeatures.includes(feature) || !validId(scope) || !validId(reason)) return denied('invalid_pause');
  const result = await execute('pause', { feature, scope, reason }, dependencies);
  return result.ok ? { ok: true } : result;
}

const operatorScope = z.literal('communications');
const mutationId = z.uuid();
const budgetOperations = {
  'budget.status': z.strictObject({ scope: operatorScope }),
  'budget.approve': z.strictObject({
    scope: operatorScope, clientMutationId: mutationId, currency: z.literal('USD'),
    maxMicros: z.string().regex(/^[1-9][0-9]{0,29}$/),
    endsAt: z.iso.datetime(), features: z.array(z.enum(communicationFeatures)).nonempty().max(communicationFeatures.length),
  }),
  'budget.revoke': z.strictObject({ scope: operatorScope, clientMutationId: mutationId, approvalId: z.uuid() }),
  'budget.pause': z.strictObject({
    scope: operatorScope, clientMutationId: mutationId, feature: z.enum(communicationFeatures), reason: z.string().trim().min(1).max(256),
  }),
  'budget.monitor': z.strictObject({ scope: operatorScope, clientMutationId: mutationId.optional(),
    recipientProfileIds: z.array(z.string().regex(/^[1-9][0-9]{0,18}$/)).max(100).optional(),
  }).refine(args => (args.recipientProfileIds === undefined) === (args.clientMutationId === undefined)),
};

/** Use the user's ERP client here. A service-role client cannot perform an owner decision. */
export async function dispatchBudget(command: CommunicationCommand, actor: CommunicationActor) {
  const { CommunicationHttpError, userRpc } = await import('./http');
  if (!Object.hasOwn(budgetOperations, command.op)) throw new CommunicationHttpError('invalid_request');
  const schema = budgetOperations[command.op as keyof typeof budgetOperations];
  const parsed = schema.safeParse(command.args);
  if (!parsed.success) throw new CommunicationHttpError('invalid_request');
  const response = await userRpc('erp_comm_budget_operator', {
    p_profile: actor.profileId, p_session: actor.authSessionId, p_op: command.op, p_args: parsed.data,
  });
  if (typeof response !== 'object' || response === null) throw new CommunicationHttpError('temporarily_unavailable');
  if (command.op === 'budget.status' && 'canMonitor' in response && response.canMonitor === true) {
    return { ...response, disabledFeatures: communicationFeatures.filter(feature => !communicationFeatureEnabled(feature)) };
  }
  return response;
}

export type CleanupResource = {
  permitId: string;
  resourceId: string;
  endpoint: 'close_sfu_tracks' | 'revoke_turn' | 'discard_partial_upload';
};
type CleanupAttempt = CleanupResource & { attemptId: string };

function validCleanup(input: CleanupResource): boolean {
  return validId(input.permitId) && /^[A-Za-z0-9][A-Za-z0-9_:/.-]{0,255}$/.test(input.resourceId) &&
    !input.resourceId.includes('..') && !input.resourceId.includes('//') &&
    ['close_sfu_tracks', 'revoke_turn', 'discard_partial_upload'].includes(input.endpoint);
}

/** Bind the exact provider resource before creating the remote effect. */
export async function bindCommunicationCleanupResource(
  input: CleanupResource, dependencies: BudgetDependencies = {},
): Promise<UpdateResult> {
  if (!validCleanup(input)) return denied('invalid_cleanup');
  const result = await execute('bind_cleanup', { ...input }, dependencies);
  return result.ok ? { ok: true } : result;
}

export async function authorizeCommunicationCleanup(
  input: CleanupAttempt, dependencies: BudgetDependencies = {},
): Promise<Denied | { ok: true; newAttempt: boolean }> {
  if (!validCleanup(input) || !validId(input.attemptId)) return denied('invalid_cleanup');
  const result = await execute('authorize_cleanup', { ...input }, dependencies);
  if (!result.ok) return result;
  if (!('newAttempt' in result.data) || typeof result.data.newAttempt !== 'boolean') return denied('invalid_budget_response');
  return { ok: true, newAttempt: result.data.newAttempt };
}

/** The trusted worker calls this only after the provider confirms terminal resource state. */
export async function confirmCommunicationCleanup(
  input: CleanupAttempt, dependencies: BudgetDependencies = {},
): Promise<UpdateResult> {
  if (!validCleanup(input) || !validId(input.attemptId)) return denied('invalid_cleanup');
  const result = await execute('confirm_cleanup', { ...input }, dependencies);
  return result.ok ? { ok: true } : result;
}
