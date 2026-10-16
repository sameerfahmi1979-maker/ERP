import {beforeEach,expect,it,vi} from 'vitest';
import {isValidElement,type ReactElement} from 'react';
import type {AuthContext} from '@/lib/rbac/check';
const m=vi.hoisted(()=>({ctx:{} as AuthContext,read:vi.fn(),filtered:vi.fn(),detail:vi.fn(),redirect:vi.fn(),notFound:vi.fn()}));
vi.mock('@/lib/rbac/check',async()=>({...await import('@/lib/rbac/scope'),getAuthContext:async()=>m.ctx}));
vi.mock('next/navigation',()=>({redirect:(href:string)=>{m.redirect(href);throw Error('REDIRECT');},notFound:()=>{m.notFound();throw Error('NOT_FOUND');}}));
vi.mock('@/server/actions/master-data/parties',()=>({getParties:m.read,getPartiesByTypeCode:m.filtered,getPartyById:m.detail}));
vi.mock('@/features/master-data/parties/parties-table',()=>({PartiesTable:()=>null}));
vi.mock('@/features/master-data/parties/party-workspace-form',()=>({PartyWorkspaceForm:()=>null}));
import AllPage from '@/app/(protected)/admin/master-data/parties/page';
import FilteredPage from '@/app/(protected)/admin/master-data/parties/[typeSlug]/page';
import RecordPage from '@/app/(protected)/admin/master-data/parties/record/[id]/page';
import {LoadError} from '@/components/erp/load-error';
import {PartiesTable} from '@/features/master-data/parties/parties-table';
async function elements(node:unknown):Promise<ReactElement<Record<string,unknown>>[]>{
 if(Array.isArray(node))return (await Promise.all(node.map(elements))).flat();
 if(!isValidElement<Record<string,unknown>>(node))return [];
 if(typeof node.type==='function'&&node.type.name==='PartiesContent')return elements(await Reflect.apply(node.type,null,[node.props]));
 return [node,...await elements(node.props.children)];
}
const filtered=(typeSlug='customers')=>FilteredPage({params:Promise.resolve({typeSlug})});
const detail=(id='8')=>RecordPage({params:Promise.resolve({id}),searchParams:Promise.resolve({mode:'view'})});
beforeEach(()=>{vi.clearAllMocks();const codes=['master_data.parties.view'];m.ctx={profile:{id:1},isAccountActive:true,roleCodes:[],permissionCodes:codes,globalPermissionCodes:codes,roleAssignments:[{roleCode:'test',ownerCompanyId:null,branchId:null,permissionCodes:codes}]} as unknown as AuthContext;m.read.mockResolvedValue({success:true,data:[]});m.filtered.mockResolvedValue({success:true,data:[]});m.detail.mockResolvedValue({success:true,data:{id:8}});});
it.each(['all','filtered','detail'])('%s failed read renders retry instead of empty/not-found',async kind=>{
 m.read.mockResolvedValue({success:false,kind:'failed'});m.filtered.mockResolvedValue({success:false,kind:'failed'});m.detail.mockResolvedValue({success:false,kind:'failed'});
 const nodes=await elements(await (kind==='all'?AllPage():kind==='filtered'?filtered():detail()));
 expect(nodes.some(n=>n.type===LoadError)).toBe(true);expect(nodes.some(n=>n.type===PartiesTable)).toBe(false);expect(m.notFound).not.toHaveBeenCalled();
});
it.each(['all','filtered','detail'])('%s company-scoped read is denied before fetching',async kind=>{
 m.ctx={...m.ctx,globalPermissionCodes:[],roleAssignments:[{roleCode:'test',ownerCompanyId:1,branchId:null,permissionCodes:['master_data.parties.view']}]};
 await expect((async()=>elements(await(kind==='all'?AllPage():kind==='filtered'?filtered():detail())))()).rejects.toThrow('REDIRECT');
 expect(m.redirect).toHaveBeenCalledWith('/access-denied');expect(m.read).not.toHaveBeenCalled();expect(m.filtered).not.toHaveBeenCalled();expect(m.detail).not.toHaveBeenCalled();
});
it.each(['all','filtered','detail'])('%s preserves legacy global viewer admission',async kind=>{
 const codes=['master_data.party_master.view'];m.ctx={...m.ctx,permissionCodes:codes,globalPermissionCodes:codes,roleAssignments:[{roleCode:'test',ownerCompanyId:null,branchId:null,permissionCodes:codes}]};
 await elements(await(kind==='all'?AllPage():kind==='filtered'?filtered():detail()));expect(m.redirect).not.toHaveBeenCalled();
});
it.each(['8junk','0','-1','8.5','9007199254740992'])('does not alias invalid record identity %s',async id=>{await expect(detail(id)).rejects.toThrow('NOT_FOUND');expect(m.detail).not.toHaveBeenCalled();});
it('known missing detail is not confused with service failure',async()=>{m.detail.mockResolvedValue({success:false,kind:'not_found'});await expect(detail()).rejects.toThrow('NOT_FOUND');});
it('revoked read access renders access-denied',async()=>{m.detail.mockResolvedValue({success:false,kind:'forbidden'});await expect(detail()).rejects.toThrow('REDIRECT');expect(m.redirect).toHaveBeenCalledWith('/access-denied');});
it.each(['customers','vendors','subcontractors','consultants','recruitment-agencies','government-authorities','insurance-companies','license-issuers'])('retains %s filtering, initial type and genuine empty results',async slug=>{
 const nodes=await elements(await filtered(slug)),table=nodes.find(n=>n.type===PartiesTable);expect(table?.props.parties).toEqual([]);expect(table?.props.defaultTypeCode).toBe(slug.replaceAll('-','_').replace(/ies$/,'y').replace(/s$/,'').toUpperCase());
});
