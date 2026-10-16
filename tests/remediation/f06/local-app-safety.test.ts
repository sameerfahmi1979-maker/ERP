import {expect,it,vi} from 'vitest';
import {assertLocalProvidersDisabled} from './local-app-safety.mjs';
it('allows retained disabled histories while checking both provider families',()=>{
 const query=vi.fn(()=> '0');expect(()=>assertLocalProvidersDisabled(query)).not.toThrow();
 expect(query.mock.calls).toEqual([
  ['select count(*) from public.erp_email_provider_configs where is_enabled is distinct from false;'],
  ['select count(*) from public.erp_ai_provider_configs where is_enabled is distinct from false;'],
 ]);
});
it.each(['erp_email_provider_configs','erp_ai_provider_configs'])('rejects any enabled or unknown-state provider in %s',table=>{
 expect(()=>assertLocalProvidersDisabled((sql:string)=>sql.includes(table)?'1':'0')).toThrow(/disable all synthetic providers/);
});
it('rejects missing counts or query errors instead of assuming safe',()=>{
 expect(()=>assertLocalProvidersDisabled(()=>undefined)).toThrow();
 expect(()=>assertLocalProvidersDisabled(()=>{throw Error('database unavailable');})).toThrow('database unavailable');
});
