import {expect,it} from 'vitest';
import {safePersistedWorkspaceRoute} from '@/lib/workspace/workspace-route-registry';
it('notification acknowledgement ticket never enters durable workspace metadata',()=>{
 const ticket='b23ec154-aa22-44cc-8fee-2b954e9bf007';
 expect(safePersistedWorkspaceRoute('/dms/documents/record/7?f10_open='+ticket)).toBe('/dms/documents/record/7');
 expect(safePersistedWorkspaceRoute('/admin/hr/employees/record/7?mode=edit&f10_open='+ticket)).toBe('/admin/hr/employees/record/7?mode=edit');
});
