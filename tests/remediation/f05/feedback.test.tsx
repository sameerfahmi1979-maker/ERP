// @vitest-environment jsdom
import './setup';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { mergeFieldIssues, useInlineFieldFeedback } from '@/components/workspace/form-feedback';
import { DraftRestoredNotice } from '@/components/workspace/draft-restored-notice';
import { SortColHeader } from '@/components/erp/table/sort-col-header';
import { collectWorkspaceFieldIssues, resolveWorkspaceFieldIssues } from '@/lib/workspace/form-validation';
afterEach(cleanup);
it('deduplicates client/server issues by control with server precedence',()=>{const control=document.createElement('input');const issue={control,label:'Name',message:'Required',section:'basic'};expect(mergeFieldIssues([issue],[{...issue,message:'Server rule'}])).toEqual([{...issue,message:'Server rule'}]);});
it('inline errors describe just their field and restore existing descriptions on correction',()=>{
 const element=document.createElement('input');element.setAttribute('aria-describedby','existing');document.body.append(element);
 const issue={control:element,label:'Email',message:'Enter a valid email address.',section:null};
 function Feedback({invalid}:{invalid:boolean}){useInlineFieldFeedback(invalid?[issue]:[]);return null;}
 const ui=render(<Feedback invalid/>);expect(element.getAttribute('aria-invalid')).toBe('true');const id=element.getAttribute('aria-describedby')!.split(' ')[1];expect(document.getElementById(id)?.textContent).toBe(issue.message);ui.rerender(<Feedback invalid={false}/>);expect(element.getAttribute('aria-describedby')).toBe('existing');expect(element.hasAttribute('aria-invalid')).toBe(false);expect(document.getElementById(id)).toBeNull();element.remove();
});
it('dismissing a restore notice is not discard and a later restoration shows it again',()=>{const discard=vi.fn();const ui=render(<DraftRestoredNotice visible onDiscard={discard}/>);fireEvent.click(screen.getByRole('button',{name:'Dismiss draft-restored notice'}));expect(discard).not.toHaveBeenCalled();expect(screen.queryByRole('status')).toBeNull();ui.rerender(<DraftRestoredNotice visible={false} onDiscard={discard}/>);ui.rerender(<DraftRestoredNotice visible onDiscard={discard}/>);expect(screen.getByRole('status')).toBeTruthy();});
it('sort is a native button with a truthful header state',()=>{const sort=vi.fn();render(<table><thead><tr><SortColHeader field="code" sortKey="code" sortDir="asc" onSort={sort}>Code</SortColHeader></tr></thead></table>);expect(screen.getByRole('columnheader').getAttribute('aria-sort')).toBe('ascending');fireEvent.click(screen.getByRole('button',{name:'Code'}));expect(sort).toHaveBeenCalledWith('code');});
it('registered required custom fields join native errors in DOM order without values',()=>{
 const ui=render(<form><section data-workspace-section="identity"><button type="button" data-workspace-field="company_id" data-workspace-required="true" data-workspace-empty="true" aria-label="Company">Select</button><input name="email" type="email" aria-label="Email" defaultValue="private-value"/><button type="button" data-workspace-required="true" data-workspace-empty="true" disabled aria-label="Disabled">Select</button></section></form>);
 const form=ui.container.querySelector('form')!;const issues=collectWorkspaceFieldIssues(form);expect(issues.map(x=>x.label)).toEqual(['Company','Email']);expect(issues[0].section).toBe('identity');expect(JSON.stringify(issues.map(({label,message})=>({label,message})))).not.toContain('private-value');
 const custom=form.querySelector('button')!;custom.dataset.workspaceEmpty='false';expect(collectWorkspaceFieldIssues(form).map(x=>x.label)).toEqual(['Email']);expect(resolveWorkspaceFieldIssues(form,{company_id:'Choose a permitted company.'})[0].control).toBe(custom);
});
