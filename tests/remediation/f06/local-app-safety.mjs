import assert from 'node:assert/strict';

// Test history is deliberately retained. Empty tables are not required, but no
// configured provider (including a local sink) may be enabled when this harness
// starts the app/build. Both provider families are checked, without reading keys.
export function assertLocalProvidersDisabled(query){
 for(const table of ['erp_email_provider_configs','erp_ai_provider_configs']){
  assert.equal(query(`select count(*) from public.${table} where is_enabled is distinct from false;`),'0',`${table}: disable all synthetic providers before starting the local app/build`);
 }
}
