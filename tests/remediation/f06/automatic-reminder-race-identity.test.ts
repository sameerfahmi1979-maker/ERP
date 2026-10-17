import {expect,it} from 'vitest';
import {automaticReminderRaceNames} from './automatic-reminder-race-identity.mjs';

it('keeps both exact PostgreSQL application identities below the 63-byte boundary',()=>{
 const names=automaticReminderRaceNames('00000000-0000-4000-8000-000000000000');
 expect(names.tag).toBe('f06-ar-00000000-0000-4000-8000-000000000000');
 expect(names.holder).toBe(names.tag+'-holder');
 expect(names.contender).toBe(names.tag+'-contender');
 expect(Buffer.byteLength(names.contender)).toBe(53);
 for(const name of Object.values(names))expect(name.slice(0,63)).toBe(name);
});
it('reproduces why the former contender name could not match pg_stat_activity',()=>{
 const old='f06-auto-reminder-00000000-0000-4000-8000-000000000000-contender';
 expect(Buffer.byteLength(old)).toBe(64);expect(old.slice(0,63)).not.toBe(old);
});
it.each(['',"bad'identity",'00000000-0000-0000-0000-000000000000'])('rejects invalid identity %s',id=>{
 expect(()=>automaticReminderRaceNames(id)).toThrow();
});
