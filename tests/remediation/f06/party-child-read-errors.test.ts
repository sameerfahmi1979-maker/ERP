// Fault-injection unit tests; database/RLS acceptance is in the .local suite.
import {beforeEach,expect,it,vi} from 'vitest';
import type {AuthContext} from '@/lib/rbac/check';
const m=vi.hoisted(()=>({ctx:{} as AuthContext,from:vi.fn(),responses:[] as unknown[],authFailure:false}));
vi.mock('@/lib/rbac/check',async()=>({...await import('@/lib/rbac/scope'),getAuthContext:async()=>{if(m.authFailure)throw Error('private session diagnostic');return m.ctx;}}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({from:m.from})}));
vi.mock('@/server/party-reference-labels',()=>({attachPartyReferenceLabels:async(_entity:string,rows:unknown[])=>rows}));
import {getPartyContacts} from '@/server/actions/master-data/party-contacts';
import {getPartyAddresses} from '@/server/actions/master-data/party-addresses';
import {getPartyBankDetails} from '@/server/actions/master-data/party-bank-details';
import {getPartyLicenses} from '@/server/actions/master-data/party-licenses';
import {getPartyTaxRegistrations} from '@/server/actions/master-data/party-tax-registrations';
import {getPartyDocuments} from '@/server/actions/master-data/party-documents';
import {getPartyNotes} from '@/server/actions/master-data/party-notes';
const reads=[['contacts',getPartyContacts],['addresses',getPartyAddresses],['bank',getPartyBankDetails],['licences',getPartyLicenses],['tax',getPartyTaxRegistrations],['documents',getPartyDocuments],['notes',getPartyNotes]] as const;
beforeEach(()=>{
 vi.clearAllMocks();m.authFailure=false;m.responses=[];
 const codes=['master_data.parties.view','master_data.parties.view_bank_details'];m.ctx={profile:{id:1},isAccountActive:true,roleCodes:[],permissionCodes:codes,globalPermissionCodes:codes,roleAssignments:[{roleCode:'test',ownerCompanyId:null,branchId:null,permissionCodes:codes}]} as unknown as AuthContext;
 m.from.mockImplementation(()=>{const result=m.responses.shift();const q={select:()=>q,eq:()=>q,order:()=>q,maybeSingle:()=>Promise.resolve(result),then:(resolve:(v:unknown)=>unknown)=>Promise.resolve(result).then(resolve)};return q;});
});
for(const stage of ['parent','children','session','null-data'])it.each(reads)(`${stage}: %s returns safe explicit failure`,async(_name,read)=>{
 const fault={data:null,error:{code:'XX000',message:'private SQL server credentials'}};
 if(stage==='session')m.authFailure=true;
 else m.responses=stage==='parent'?[fault]:[{data:{id:1},error:null},stage==='null-data'?{data:null,error:null}:fault];
 const result=await read(1);expect(result).toMatchObject({success:false,kind:'failed'});expect(JSON.stringify(result)).not.toMatch(/private|SQL|credentials/);
});
it.each(reads)('%s rejects malformed parent identities without a database read',async(_name,read)=>{for(const id of [0,-1,1.5,NaN,Number.MAX_SAFE_INTEGER+1])expect(await read(id)).toMatchObject({success:false,kind:'not_found'});expect(m.from).not.toHaveBeenCalled();});
it.each(reads)('%s no-role denial takes precedence over parent existence',async(_name,read)=>{m.ctx={...m.ctx,permissionCodes:[],globalPermissionCodes:[],roleAssignments:[]};expect(await read(1)).toMatchObject({success:false,kind:'forbidden'});expect(m.from).not.toHaveBeenCalled();});
it('bank data requires its separate global permission',async()=>{const codes=['master_data.parties.view'];m.ctx={...m.ctx,permissionCodes:codes,globalPermissionCodes:codes,roleAssignments:[{roleCode:'test',ownerCompanyId:null,branchId:null,permissionCodes:codes}]};expect(await getPartyBankDetails(1)).toMatchObject({success:false,kind:'forbidden'});expect(m.from).not.toHaveBeenCalled();});
