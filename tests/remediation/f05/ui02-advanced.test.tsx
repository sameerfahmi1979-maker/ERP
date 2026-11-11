// @vitest-environment jsdom
import './setup';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WorkspaceUiMemoryProvider } from '@/hooks/use-persistent-ui-state';
import { DmsApprovalWorkflowFormDialog } from '@/features/dms/approvals/admin/dms-approval-workflow-form-dialog';
import { DmsAdminFileStoragePanel } from '@/features/dms/admin/dms-admin-file-storage-panel';
import { DmsReviewQueueFilters } from '@/features/dms/review-queue/dms-review-queue-filters';
import { filterDmsRows } from '@/features/dms/dms-list-view';
import type { WorkflowWithSteps } from '@/server/actions/dms/document-approvals';
import type { DmsDocumentTypeRow } from '@/server/actions/dms/document-types';
import type { ReactNode } from 'react';
const mocks=vi.hoisted(()=>({create:vi.fn(),update:vi.fn(),files:vi.fn(),remove:vi.fn(),roles:vi.fn(),assignees:vi.fn()}));
vi.mock('@/server/actions/dms/document-approvals',()=>({adminCreateApprovalWorkflow:mocks.create,adminUpdateApprovalWorkflow:mocks.update,adminListApprovalRoleOptions:mocks.roles,adminListApprovalAssigneeOptions:mocks.assignees}));
vi.mock('@/server/actions/dms/document-files',()=>({adminListDmsFiles:mocks.files,adminHardDeleteDmsFile:mocks.remove}));
function Wrap({children}:{children:ReactNode}){return <QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><FluentProvider theme={webLightTheme}><WorkspaceUiMemoryProvider>{children}</WorkspaceUiMemoryProvider></FluentProvider></QueryClientProvider>;}
beforeEach(()=>{vi.resetAllMocks();mocks.roles.mockResolvedValue({success:true,data:[{code:'synthetic_reviewer',name:'Synthetic reviewer'}]});mocks.assignees.mockResolvedValue({success:true,data:[{id:2,label:'Synthetic approver'}]});mocks.files.mockResolvedValue({success:true,data:{rows:[],total:0}});});afterEach(cleanup);
const workflow={id:41,workflowCode:'SYN_EDIT',nameEn:'Synthetic existing',isActive:true,ownerCompanyId:1,documentTypeIds:[7],steps:[{id:1,stepCode:'REVIEW',stepName:'Review',sortOrder:0,isInitial:true,isFinal:true,isActive:true,assigneeProfileIds:[2]}]} as WorkflowWithSteps;
function form(editing:WorkflowWithSteps|null=null, documentTypes:DmsDocumentTypeRow[]=[]){const close=vi.fn(),success=vi.fn();const view=render(<DmsApprovalWorkflowFormDialog open onOpenChange={close} editing={editing} documentTypes={documentTypes} onSuccess={success}/>,{wrapper:Wrap});return {close,success,...view};}
const workflowTypes = [
  {id: 55, type_code: 'ISO_9001', name_en: 'ISO 9001 Certificate', is_active: true},
  {id: 56, type_code: 'OTHER', name_en: 'Other', is_active: true},
  {id: 57, type_code: 'RETIRED', name_en: 'Retired', is_active: false},
] as DmsDocumentTypeRow[];
it('selects every available active document type and keeps existing mappings until Save', async () => {
  mocks.update.mockResolvedValue({success: true});
  form({...workflow, isActive: false, documentTypeIds: [7, 55]}, workflowTypes);
  const selectAll = screen.getByRole<HTMLButtonElement>('button', {name: 'Select all'});
  fireEvent.click(selectAll);
  expect(screen.getByRole<HTMLInputElement>('checkbox', {name: /ISO 9001 Certificate/}).checked).toBe(true);
  expect(screen.getByRole<HTMLInputElement>('checkbox', {name: /OTHER/}).checked).toBe(true);
  expect(screen.queryByRole('checkbox', {name: /Retired/})).toBeNull();
  expect(selectAll.disabled).toBe(true);
  expect(mocks.update).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', {name: 'Save', exact: true}));
  await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(41, expect.objectContaining({document_type_ids: [7, 55, 56]})));
});
it('clears the draft selection so an ISO-only workflow can be saved', async () => {
  mocks.update.mockResolvedValue({success: true});
  form({...workflow, isActive: false, documentTypeIds: [7, 55, 56]}, workflowTypes);
  fireEvent.click(screen.getByRole('button', {name: 'Clear all'}));
  expect(screen.getByRole<HTMLButtonElement>('button', {name: 'Clear all'}).disabled).toBe(true);
  fireEvent.click(screen.getByRole('checkbox', {name: /ISO 9001 Certificate/}));
  fireEvent.click(screen.getByRole('button', {name: 'Save', exact: true}));
  await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(41, expect.objectContaining({document_type_ids: [55]})));
});
it('required-role selection displays role names and supports retry without losing its selection',async()=>{mocks.roles.mockRejectedValueOnce(new Error('private'));form({...workflow,steps:[{...workflow.steps[0],requiresRole:'synthetic_reviewer'}]});await screen.findByText(/Approval roles could not be loaded/);expect((screen.getByLabelText('Step 1 required role') as HTMLSelectElement).value).toBe('synthetic_reviewer');fireEvent.click(screen.getByRole('button',{name:'Retry roles'}));await screen.findByRole('option',{name:'Synthetic reviewer'});expect((screen.getByLabelText('Step 1 required role') as HTMLSelectElement).disabled).toBe(false);expect(screen.queryByText('private')).toBeNull();});
it('retries the ALS approver lookup with the exact scope and keeps the selected reviewer', async () => {
  mocks.assignees.mockResolvedValueOnce({success: false});
  form({...workflow, ownerCompanyId: 2, branchId: null, documentTypeIds: [55],
    steps: [{...workflow.steps[0], requiresRole: 'synthetic_reviewer'}]});
  const retry = await screen.findByRole('button', {name: 'Retry approvers'});
  expect((screen.getByLabelText('Step 1 assigned approvers') as HTMLSelectElement).value).toBe('2');
  fireEvent.click(retry);
  await screen.findByRole('option', {name: 'Synthetic approver'});
  expect(mocks.assignees).toHaveBeenLastCalledWith({companyId: 2, branchId: null, requiredRole: 'synthetic_reviewer'});
  expect((screen.getByLabelText('Step 1 assigned approvers') as HTMLSelectElement).value).toBe('2');
});
it('opening an edit after a closed empty dialog initializes the selected workflow',()=>{const props={onOpenChange:vi.fn(),onSuccess:vi.fn(),documentTypes:[]};const view=render(<DmsApprovalWorkflowFormDialog open={false} editing={null} {...props}/>,{wrapper:Wrap});view.rerender(<DmsApprovalWorkflowFormDialog open editing={workflow} {...props}/>);expect((screen.getByLabelText('Workflow Name (EN)') as HTMLInputElement).value).toBe(workflow.nameEn);expect((screen.getByLabelText('Step 1 code') as HTMLInputElement).value).toBe('REVIEW');});
it('changing the selected workflow starts a separate form session',()=>{const props={open:true,onOpenChange:vi.fn(),onSuccess:vi.fn(),documentTypes:[]};const view=render(<DmsApprovalWorkflowFormDialog editing={workflow} {...props}/>,{wrapper:Wrap});fireEvent.change(screen.getByLabelText('Workflow Name (EN)'),{target:{value:'Unsaved A'}});view.rerender(<DmsApprovalWorkflowFormDialog editing={{...workflow,id:42,nameEn:'Synthetic B'}} {...props}/>);expect((screen.getByLabelText('Workflow Name (EN)') as HTMLInputElement).value).toBe('Synthetic B');});
it('workflow required fields use the global linked summary before any action',()=>{form();fireEvent.click(screen.getByRole('button',{name:'Add',exact:true}));expect(screen.getByRole('alert').textContent).toContain('Check 6 fields');expect(mocks.create).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:/Step 2 name:/}));expect(document.activeElement).toBe(screen.getByLabelText('Step 2 name'));});
it('confirmed workflow save closes despite the in-flight busy guard',async()=>{mocks.update.mockResolvedValue({success:true});const view=form(workflow);fireEvent.click(screen.getByRole('button',{name:'Save',exact:true}));await waitFor(()=>expect(view.close).toHaveBeenCalledWith(false));expect(view.success).toHaveBeenCalledOnce();expect(mocks.update).toHaveBeenCalledWith(41,expect.objectContaining({name_en:'Synthetic existing'}));});
it('workflow response loss preserves values and does not close or leak backend details',async()=>{mocks.update.mockRejectedValue(new Error('private backend detail'));const view=form(workflow);fireEvent.change(screen.getByLabelText('Workflow Name (EN)'),{target:{value:'Keep my edits'}});fireEvent.click(screen.getByRole('button',{name:'Save',exact:true}));await screen.findByText(/The save could not be confirmed/);expect((screen.getByLabelText('Workflow Name (EN)') as HTMLInputElement).value).toBe('Keep my edits');expect(view.close).not.toHaveBeenCalled();expect(view.success).not.toHaveBeenCalled();expect(screen.queryByText('private backend detail')).toBeNull();expect((screen.getByRole('button',{name:'Save',exact:true}) as HTMLButtonElement).disabled).toBe(false);});
it('workflow rejected save remains open with an announced error',async()=>{mocks.update.mockResolvedValue({success:false,error:'private'});const view=form(workflow);fireEvent.click(screen.getByRole('button',{name:'Save',exact:true}));await screen.findByRole('alert');expect(view.close).not.toHaveBeenCalled();expect(screen.getByRole('alert').textContent).toContain('not saved');});
it('step reorder retains entered values but cannot move the initial step after the final step',async()=>{form({...workflow,steps:[{...workflow.steps[0],isFinal:false},{...workflow.steps[0],id:2,stepCode:'FINAL',stepName:'Final',sortOrder:1,isInitial:false,isFinal:true}]});fireEvent.click(screen.getByRole('button',{name:'Move step 2 up'}));expect((screen.getByLabelText('Step 1 code') as HTMLInputElement).value).toBe('FINAL');fireEvent.click(screen.getByRole('button',{name:'Save',exact:true}));expect(mocks.update).not.toHaveBeenCalled();expect(screen.getByRole('alert').textContent).toContain('first step must be Initial');});
it('workflow double submit calls the server once and prevents user dismissal while pending',async()=>{let resolve!:(v:{success:boolean})=>void;mocks.update.mockReturnValue(new Promise(r=>{resolve=r;}));const view=form(workflow);const save=screen.getByRole('button',{name:'Save',exact:true});fireEvent.click(save);fireEvent.click(save);fireEvent.click(screen.getByRole('button',{name:'Cancel',exact:true}));expect(mocks.update).toHaveBeenCalledOnce();expect(view.close).not.toHaveBeenCalled();resolve({success:true});await waitFor(()=>expect(view.success).toHaveBeenCalledOnce());});
it('storage rejected load renders retry rather than an empty list and refresh is not nested in the toggle',async()=>{mocks.files.mockRejectedValueOnce(new Error('private'));render(<Wrap><DmsAdminFileStoragePanel/></Wrap>);const toggle=screen.getByRole('button',{name:/File Storage Inspector/});fireEvent.click(toggle);await screen.findByRole('alert');expect(screen.queryByText('No file records found')).toBeNull();expect(toggle.contains(screen.getByRole('button',{name:'Refresh',exact:true}))).toBe(false);fireEvent.click(screen.getByRole('button',{name:'Retry'}));await screen.findByText('No file records found');expect(mocks.files).toHaveBeenLastCalledWith({includeDeleted:true,limit:200});});
it('review multi-select retains several statuses only after Apply, with other criteria intact',()=>{const change=vi.fn();render(<Wrap><DmsReviewQueueFilters filters={{documentId:19}} onChange={change} isLoading={false}/></Wrap>);fireEvent.click(screen.getByRole('button',{name:'Edit filters'}));fireEvent.click(screen.getByRole('checkbox',{name:'Open',exact:true}));fireEvent.click(screen.getByRole('checkbox',{name:'In review',exact:true}));expect(change).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Apply',exact:true}));expect(change).toHaveBeenCalledWith(expect.objectContaining({documentId:19,status:['open','in_review']}));});
it('review filter Cancel preserves criteria; chips display labels and clear the selected group',()=>{const change=vi.fn();render(<Wrap><DmsReviewQueueFilters filters={{status:['open','in_review'],priority:['high']}} onChange={change} isLoading={false}/></Wrap>);expect(screen.getByRole('button',{name:'Remove Status filter'}).textContent).toContain('Open, In review');fireEvent.click(screen.getByRole('button',{name:/^Edit filters/}));fireEvent.click(screen.getByRole('checkbox',{name:'Open',exact:true}));fireEvent.click(screen.getByRole('button',{name:'Cancel',exact:true}));expect(change).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Remove Status filter'}));expect(change).toHaveBeenCalledWith(expect.objectContaining({status:undefined,priority:['high']}));});
it('multi-select matching is exact rather than substring-based',()=>{expect(filterDmsRows([{status:'open'},{status:'reopened'},{status:'in_review'}],[{id:'status',path:'status',label:'Status',type:'multi-select'}],{status:'open,in_review'},'')).toEqual([{status:'open'},{status:'in_review'}]);});
