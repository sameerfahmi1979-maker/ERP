import { expect, it } from 'vitest';
import { createTabFromRoute, safePersistedWorkspaceRoute } from '@/lib/workspace/workspace-route-registry';
it('Department pilot has stable list identity and safely restorable route metadata',()=>{
 const tab=createTabFromRoute('/admin/common-master-data/departments');expect(tab.title).toBe('Departments');expect(tab.tabKind).toBe('list');expect(safePersistedWorkspaceRoute('/admin/common-master-data/departments?search=PRIVATE')).toBe('/admin/common-master-data/departments');
});
it('adding the pilot metadata does not allow unknown descendants or external URLs into storage',()=>{
 expect(safePersistedWorkspaceRoute('/admin/common-master-data/departments/unknown-sensitive-route')).toBeNull();expect(safePersistedWorkspaceRoute('//outside.invalid')).toBeNull();
});
