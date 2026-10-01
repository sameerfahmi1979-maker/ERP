import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Narrow source contracts complement the authenticated browser acceptance;
// these checks do not certify runtime authorization or assistive technology.
const read=(file:string)=>readFileSync(file,'utf8');
describe('F05 pre-publication screen regressions',()=>{
  it.each([
    ['attendance','Daily Attendance'], ['leave','Leave Requests'], ['shifts','Shift Calendar'],
  ])('HR time %s has a top-level page heading', (route,title)=>{
    expect(read(`src/app/(protected)/admin/hr/time/${route}/page.tsx`)).toContain(`<h1>${title}</h1>`);
  });
  it('disabled AI dashboard retains its page heading',()=>{
    expect(read('src/app/(protected)/admin/ai/dashboard/page.tsx')).toMatch(/<h1[^>]*>AI Daily Dashboard is not enabled\.<\/h1>/);
  });
  it('DMS observability denied and disabled states retain page headings',()=>{
    const source=read('src/features/dms/ai-observability/dms-ai-observability-page-client.tsx');
    expect(source).toMatch(/<h1[^>]*>Access Denied<\/h1>/);
    expect(source).toMatch(/<h1[^>]*>DMS AI Observability is not enabled<\/h1>/);
  });
  it('employee-only capability cannot trigger forbidden master-data filter reads',()=>{
    const source=read('src/features/hr/employees/employees-table.tsx');
    for(const kind of ['Departments','Designations']){
      expect(source).toContain(`enabled: canFilter${kind}`);
      expect(source).toContain(`hasPermission(authContext, "common_md.${kind.toLowerCase()}.view")`);
      expect(source).toContain(`...(canFilter${kind} ? [`);
    }
    expect(source).toContain('Some filters are unavailable with your current permissions.');
  });
});
