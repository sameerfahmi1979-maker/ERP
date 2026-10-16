// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {AuthContext} from '@/lib/rbac/check';
import {createPartySchema,updatePartySchema} from '@/features/master-data/parties/party-schemas';
const m=vi.hoisted(()=>({data:[{type_code:'CUSTOMER',type_name:'Customer',is_active:true}],isPending:false,isError:false,refetch:vi.fn()}));
vi.mock('@tanstack/react-query',()=>({useQuery:()=>m}));
vi.mock('@/server/actions/master-data/parties',()=>({getPartyTypes:vi.fn()}));
import {PartyCreationTypeNotice} from '@/features/master-data/parties/party-creation-type-notice';
const ctx={profile:{id:1},isAccountActive:true,accountStatus:'active',permissionCodes:['master_data.parties.manage_types'],globalPermissionCodes:['master_data.parties.manage_types'],roleCodes:[],roleAssignments:[]} as unknown as AuthContext;
beforeEach(()=>{m.data=[{type_code:'CUSTOMER',type_name:'Customer',is_active:true}];m.isPending=false;m.isError=false;vi.clearAllMocks();});afterEach(cleanup);
it('names the actual configured type and explains atomic assignment',()=>{render(<PartyCreationTypeNotice code="CUSTOMER" authContext={ctx}/>);expect(screen.getByRole('status').textContent).toContain('Initial party type: Customer');expect(screen.getByRole('status').textContent).toContain('together');});
it('missing active classification is an error, not silently unclassified creation',()=>{m.data=[];render(<PartyCreationTypeNotice code="CUSTOMER" authContext={ctx}/>);expect(screen.getByRole('alert').textContent).toContain('unavailable');});
it('read failure offers retry without inventing a type',()=>{m.isError=true;render(<PartyCreationTypeNotice code="CUSTOMER" authContext={ctx}/>);fireEvent.click(screen.getByRole('button',{name:'Retry loading type'}));expect(m.refetch).toHaveBeenCalledOnce();});
it('unauthorized assignment explains the permitted unclassified alternative',()=>{render(<PartyCreationTypeNotice code="CUSTOMER" authContext={{...ctx,permissionCodes:[],globalPermissionCodes:[]}}/>);expect(screen.getByRole('alert').textContent).toContain('Use All Parties');});
it('loading is not presented as a missing type',()=>{m.isPending=true;render(<PartyCreationTypeNotice code="CUSTOMER" authContext={ctx}/>);expect(screen.getByRole('status').textContent).toContain('Loading');expect(screen.queryByRole('alert')).toBeNull();});
it('creation accepts a type code, rejects ambiguous selectors and never accepts it as an update field',()=>{
 const base={display_name:'Synthetic',legal_name_en:'Synthetic',party_nature_id:1,party_status_id:1,country_id:1};
 expect(createPartySchema.strict().safeParse({...base,initial_type_code:'CUSTOMER'}).success).toBe(true);
 expect(createPartySchema.strict().safeParse({...base,initial_type_code:'CUSTOMER',primary_party_type_id:1}).success).toBe(false);
 expect(updatePartySchema.strict().safeParse({...base,id:1,initial_type_code:'CUSTOMER'}).success).toBe(false);
});
