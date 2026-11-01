// @vitest-environment jsdom
import '../f05/setup';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {FluentProvider,webLightTheme} from '@fluentui/react-components';
import {publishedTemplate,amendmentState} from './template-amendment-fixture';
const m=vi.hoisted(()=>({get:vi.fn(),transition:vi.fn(),saved:vi.fn(),close:vi.fn()}));
vi.mock('@/server/actions/reports/template-amendments',()=>({getTemplateAmendment:m.get,transitionTemplateAmendment:m.transition}));
vi.mock('@/features/report-center/template-form',()=>({TemplateForm:(p:{adminAmendment?:boolean})=><div>Editing mode: {p.adminAmendment?'pending changes':'legacy'}</div>}));
import {TemplateAmendmentDialog} from '@/features/report-center/template-amendment-dialog';
beforeEach(()=>{vi.resetAllMocks();m.get.mockResolvedValue({success:true,data:amendmentState()});m.transition.mockResolvedValue({success:true,data:amendmentState('in_review')});});
afterEach(cleanup);
function ui(canEdit=true){return <FluentProvider theme={webLightTheme}><TemplateAmendmentDialog open template={publishedTemplate} profiles={[]} canEdit={canEdit} canApprove canPublish canSignGlobal onOpenChange={m.close} onPublished={m.saved}/></FluentProvider>;}
it('edits the same published template through the pending-change form',async()=>{
 render(ui());fireEvent.click(await screen.findByRole('button',{name:'Edit this template'}));expect(screen.getByText('Editing mode: pending changes')).toBeTruthy();
});
it('load failure is explicit and does not enable editing',async()=>{
 m.get.mockRejectedValueOnce(Error('synthetic network loss'));render(ui());await screen.findByText('Pending changes could not be loaded.');
 expect(screen.queryByRole('button',{name:'Edit this template'})).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Retry loading changes'}));await screen.findByRole('button',{name:'Edit this template'});
});
it('shows reviewers the exact changed configuration but no editing capability',async()=>{
 m.get.mockResolvedValue({success:true,data:amendmentState('in_review')});render(ui(false));await screen.findByText('Proposed template');
 expect(screen.getByText('Synthetic published template',{selector:'td'})).toBeTruthy();expect(screen.queryByRole('button',{name:'Edit pending changes'})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Approve changes'}));await waitFor(()=>expect(m.transition).toHaveBeenCalledWith(42,'approve',expect.objectContaining({revision:'4'}),undefined));
});
it('an uncertain transition retries its original identity and blocks closing',async()=>{
 m.get.mockResolvedValue({success:true,data:amendmentState('draft')});m.transition.mockResolvedValueOnce({success:false,uncertain:true,error:'lost'});
 render(ui());fireEvent.click(await screen.findByRole('button',{name:'Submit changes for review'}));await screen.findByRole('button',{name:'Retry retained request'});
 for(const button of screen.getAllByRole('button',{name:'Close',exact:true}))fireEvent.click(button);expect(m.close).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Retry retained request'}));await waitFor(()=>expect(m.transition).toHaveBeenCalledTimes(2));
 expect(m.transition.mock.calls[1]).toEqual(m.transition.mock.calls[0]);
});
it('a changed published revision cannot be overwritten by a stale draft',async()=>{
 m.get.mockResolvedValue({success:true,data:{...amendmentState('approved'),published_template:{...publishedTemplate,workspace_revision:'9'}}});render(ui());
 await screen.findByText('The published version changed. Discard these pending changes after reviewing them, then start again.');
 expect(screen.queryByRole('button',{name:'Publish changes'})).toBeNull();expect(screen.getByRole('button',{name:'Discard pending changes'})).toBeTruthy();
});
it('a retired dialog cannot display a late draft or update the catalogue',async()=>{
 let resolve!:(r:unknown)=>void;m.get.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));render(ui());cleanup();
 await act(async()=>resolve({success:true,data:amendmentState('draft')}));expect(m.saved).not.toHaveBeenCalled();
});
