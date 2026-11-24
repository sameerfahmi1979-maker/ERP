import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import type { BudgetDependencies } from './budget';

export function pttCleanupBudget(signal: AbortSignal): BudgetDependencies {
  return { store: { async transact(command, payload) {
    signal.throwIfAborted();
    const {data,error} = await createAdminClient().rpc('erp_comm_budget_command', {p_command:command,p_payload:payload}).abortSignal(signal);
    if (error) throw Error('Cleanup authority unavailable');
    return data;
  } } };
}
