import {beforeEach,expect,it,vi} from 'vitest';
import type {ReportTemplate} from '@/lib/report-center/types';
const m=vi.hoisted(()=>({submit:vi.fn(),approve:vi.fn(),reject:vi.fn(),publish:vi.fn(),archive:vi.fn(),copy:vi.fn(),review:vi.fn(),load:vi.fn()}));
vi.mock('@/server/actions/reports/template-governance',()=>({submitTemplateForReview:m.submit,approveTemplate:m.approve,rejectTemplate:m.reject,publishTemplate:m.publish,archiveTemplate:m.archive,createTemplateDraftVersion:m.copy,runTemplateSecurityReviewAction:m.review}));
vi.mock('@/server/actions/reports/templates',()=>({getReportTemplate:m.load}));
import {createTemplateGovernanceAttempt} from '@/lib/report-center/template-governance-attempt';
const row={id:1,workspace_revision:'7'};
const receipt={id:1,source_id:1,revision:'8',governance_status:'approved',security_review_status:'passed',changed:true,replayed:false,owner_company_id:1,review:null};
const saved={id:1,workspace_revision:'8',governance_status:'approved',template_name:'Server saved',parent_template_id:null} as ReportTemplate;
for(const malformed of [false,true])it(`${malformed?'malformed receipt':'rejected promise'} remains unresolved through a known denial`,async()=>{
 const a=createTemplateGovernanceAttempt();if(malformed)m.approve.mockResolvedValueOnce({success:true,receipt:{...receipt,source_id:99}});else m.approve.mockRejectedValueOnce(Error('PRIVATE TRANSPORT'));
 m.approve.mockResolvedValueOnce({success:false,error:'Rolled back'});await expect(a.run(row,'approve')).rejects.toThrow();await expect(a.run(row,'approve')).rejects.toThrow(/earlier change is still unconfirmed/);await a.run(row,'approve');expect(m.approve.mock.calls[2]).toEqual(m.approve.mock.calls[0]);
});
it('retains accumulated uncertainty after a later known rejection',async()=>{
 const a=createTemplateGovernanceAttempt();m.approve.mockResolvedValueOnce({success:false,uncertain:true,error:'Lost response'}).mockResolvedValueOnce({success:false,error:'The change was rolled back.'});
 await expect(a.run(row,'approve')).rejects.toThrow();await expect(a.run({...row,workspace_revision:'99'},'approve')).rejects.toThrow(/unconfirmed/i);
 await expect(a.run(row,'reject','Other decision')).rejects.toThrow(/unconfirmed/i);expect(m.reject).not.toHaveBeenCalled();
 await a.run({...row,workspace_revision:'99'},'approve');expect(m.approve.mock.calls[2]).toEqual(m.approve.mock.calls[0]);
});
it('normalizes rejected saved reads and never repeats their mutation',async()=>{
 const a=createTemplateGovernanceAttempt();m.load.mockRejectedValueOnce(Error('PRIVATE READ ERROR'));
 await expect(a.run(row,'approve')).rejects.toThrow(/Saved, but/);await a.run(row,'approve');expect(m.approve).toHaveBeenCalledOnce();
});
beforeEach(()=>{Object.values(m).forEach(fn=>fn.mockReset());m.approve.mockResolvedValue({success:true,receipt});m.load.mockResolvedValue({success:true,data:saved});});
it('uses the loaded revision and displays the actual saved row rather than inventing fields',async()=>{
 const a=createTemplateGovernanceAttempt();const r=await a.run(row,'approve');expect(m.approve.mock.calls[0][1]).toMatchObject({revision:'7'});expect(r.template).toEqual(saved);expect(r.receipt).toEqual(receipt);a.acknowledged();
});
it('uncertain retry retains its original operation and revision despite prop refresh',async()=>{
 const a=createTemplateGovernanceAttempt();m.approve.mockResolvedValueOnce({success:false,uncertain:true,error:'Lost response'});
 await expect(a.run(row,'approve')).rejects.toThrow('Lost response');await a.run({...row,workspace_revision:'8'},'approve');expect(m.approve.mock.calls[1][1]).toEqual(m.approve.mock.calls[0][1]);
});
it('unknown response prevents changing the action or reason before reconciliation',async()=>{
 const a=createTemplateGovernanceAttempt();m.approve.mockRejectedValueOnce(Error('Network timeout'));await expect(a.run(row,'approve')).rejects.toThrow();
 await expect(a.run(row,'reject','A different decision')).rejects.toThrow('previous change is unconfirmed');expect(m.reject).not.toHaveBeenCalled();
});
it('incomplete success cannot masquerade as an authoritative commit',async()=>{
 const a=createTemplateGovernanceAttempt();m.approve.mockResolvedValueOnce({success:true,receipt:{id:1}});await expect(a.run(row,'approve')).rejects.toThrow('incomplete');
 await a.run(row,'approve');expect(m.approve.mock.calls[1][1]).toEqual(m.approve.mock.calls[0][1]);
});
it('saved-row reload failure retries only the read, never the committed action',async()=>{
 const a=createTemplateGovernanceAttempt();m.load.mockResolvedValueOnce({success:false});await expect(a.run(row,'approve')).rejects.toThrow('Saved');await a.run(row,'approve');expect(m.approve).toHaveBeenCalledTimes(1);expect(m.load).toHaveBeenCalledTimes(2);
});
it('a mismatched loaded identity is not displayed as the saved record',async()=>{
 const a=createTemplateGovernanceAttempt();m.load.mockResolvedValueOnce({success:true,data:{...saved,id:99}});await expect(a.run(row,'approve')).rejects.toThrow('could not be loaded');await a.run(row,'approve');expect(m.approve).toHaveBeenCalledTimes(1);
});
it('a wrong source receipt remains unconfirmed and cannot cross record boundaries',async()=>{
 const a=createTemplateGovernanceAttempt();m.approve.mockResolvedValueOnce({success:true,receipt:{...receipt,source_id:2}});await expect(a.run(row,'approve')).rejects.toThrow('incomplete');expect(m.load).not.toHaveBeenCalled();
});
it('a definitive rollback permits a fresh corrected attempt',async()=>{
 const a=createTemplateGovernanceAttempt();m.reject.mockResolvedValueOnce({success:false,error:'Reason too short'}).mockResolvedValueOnce({success:true,receipt:{...receipt,governance_status:'rejected'}});
 await expect(a.run(row,'reject','x')).rejects.toThrow('short');await a.run(row,'reject','Meaningful reason');expect(m.reject.mock.calls[0][1].operationId).not.toBe(m.reject.mock.calls[1][1].operationId);
});
it('a committed failed review still refreshes its real revision and findings',async()=>{
 const a=createTemplateGovernanceAttempt();const review={passed:false,severity:'block',findings:[{field:'body',rule:'script_tag',severity:'block',excerpt:'synthetic'}]};
 m.submit.mockResolvedValue({success:false,error:'Review blocked',receipt:{...receipt,governance_status:'draft',security_review_status:'failed',review}});
 const r=await a.run(row,'submit');expect(r.receipt.review).toEqual(review);expect(m.load).toHaveBeenCalledWith(1);
});
it('new-version reload and callback recovery never create a second draft',async()=>{
 const a=createTemplateGovernanceAttempt();m.copy.mockResolvedValue({success:true,data:{id:2},receipt:{...receipt,id:2,revision:'1',governance_status:'draft'}});m.load.mockResolvedValue({success:true,data:{...saved,id:2,parent_template_id:1}});
 const r=await a.run(row,'new_version');expect(r.template.id).toBe(2);await a.run(row,'new_version');expect(m.copy).toHaveBeenCalledTimes(1);
});
it('publishing refreshes the superseded parent and retries that read without republishing',async()=>{
 const a=createTemplateGovernanceAttempt();m.publish.mockResolvedValue({success:true,receipt:{...receipt,governance_status:'published'}});
 m.load.mockResolvedValueOnce({success:true,data:{...saved,parent_template_id:3}}).mockResolvedValueOnce({success:false})
  .mockResolvedValueOnce({success:true,data:{...saved,parent_template_id:3}}).mockResolvedValueOnce({success:true,data:{...saved,id:3,governance_status:'archived'}});
 await expect(a.run(row,'publish')).rejects.toThrow('superseded');const result=await a.run(row,'publish');expect(result.related[0].id).toBe(3);expect(m.publish).toHaveBeenCalledTimes(1);
});
