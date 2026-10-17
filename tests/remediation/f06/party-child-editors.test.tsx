// @vitest-environment jsdom
// Actual six tabs and shared dialog/session. Read adapters, selectors, table
// renderer and server actions are doubled; not a browser acceptance claim.
import '../f05/setup';
import {cleanup,render,screen,fireEvent,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createWorkspaceDraftStore} from '@/lib/workspace/workspace-draft-store';
import type {ReactNode} from 'react';
import type {AuthContext} from '@/lib/rbac/check';
type TestRow=Record<string,unknown>&{id:number};
type TestTable={data:TestRow[];columns:{id?:string;cell?:(props:{row:{original:TestRow}})=>ReactNode}[]};
const m=vi.hoisted(()=>({rows:[] as TestRow[],create:vi.fn(),update:vi.fn(),archive:vi.fn(),invalidate:vi.fn(),success:vi.fn(),error:vi.fn(),store:null as unknown}));
vi.mock('@/hooks/use-workspace-form-owner',()=>({useWorkspaceFormOwner:()=>({id:'six-child-editors'})}));
vi.mock('@/components/workspace/workspace-draft-provider',()=>({useWorkspaceDraftStoreContext:()=>m.store}));
vi.mock('@/hooks/use-workspace-navigation-lock',()=>({useWorkspaceNavigationLock:vi.fn()}));
vi.mock('@/hooks/use-workspace',()=>({useWorkspace:()=>({openTab:vi.fn()})}));
vi.mock('@/hooks/lookups',()=>({useBanksQuery:()=>({options:[]})}));
vi.mock('@/server/actions/master-data/party-contacts',()=>({createPartyContact:m.create,updatePartyContact:m.update,deletePartyContact:vi.fn()}));
vi.mock('@/server/actions/master-data/party-child-lifecycle',()=>({setPartyChildArchived:m.archive}));
vi.mock('@/server/actions/master-data/party-bank-details',()=>({createPartyBankDetail:m.create,updatePartyBankDetail:m.update,deletePartyBankDetail:vi.fn(),verifyPartyBankDetail:vi.fn()}));
vi.mock('@/server/actions/master-data/party-licenses',()=>({createPartyLicense:m.create,updatePartyLicense:m.update,deletePartyLicense:vi.fn()}));
vi.mock('@/server/actions/master-data/party-tax-registrations',()=>({createPartyTaxRegistration:m.create,updatePartyTaxRegistration:m.update,deletePartyTaxRegistration:vi.fn()}));
vi.mock('@/server/actions/master-data/party-documents',()=>({createPartyDocument:m.create,updatePartyDocument:m.update,deletePartyDocument:vi.fn()}));
vi.mock('@/server/actions/master-data/party-notes',()=>({createPartyNote:m.create,updatePartyNote:m.update,deletePartyNote:vi.fn(),getPartyNotes:vi.fn(),getPartyNoteTypes:vi.fn()}));
vi.mock('@/server/actions/master-data/party-finance-profiles',()=>({getPartyFinanceProfile:async()=>({success:true,data:null}),upsertPartyFinanceProfile:vi.fn()}));
vi.mock('@/server/actions/master-data/parties',()=>({getPartyContactRoles:vi.fn(),getPartyContactDepartments:vi.fn(),checkDuplicateIban:vi.fn(),getPartyLicenseStatuses:vi.fn(),getPartyLicenseTypes:vi.fn(),getPartyTaxStatuses:vi.fn(),getPaymentMethods:vi.fn(),getPartyDocumentTypes:vi.fn(),getPartyDocumentStatuses:vi.fn()}));
vi.mock('@/features/master-data/parties/hooks/use-party-child-queries',()=>{
 const query=()=>({items:m.rows,isLoading:false,refetch:vi.fn()});return {usePartyContactsQuery:query,usePartyBankDetailsQuery:query,usePartyLicensesQuery:query,usePartyTaxRegistrationsQuery:query,usePartyDocumentsQuery:query};
});
vi.mock('@/hooks/child-tables/use-child-table-query',()=>({useChildTableQuery:()=>({data:m.rows,isLoading:false,refetch:vi.fn()})}));
vi.mock('@/hooks/realtime/use-realtime-sync',()=>({useRealtimeSync:vi.fn()}));
vi.mock('@/lib/query/invalidation',()=>({invalidatePartyContacts:m.invalidate,invalidatePartyBankDetails:m.invalidate,invalidatePartyLicenses:m.invalidate,invalidatePartyTaxRegistrations:m.invalidate,invalidatePartyDocuments:m.invalidate}));
vi.mock('sonner',()=>({toast:{success:m.success,error:m.error}}));
vi.mock('@tanstack/react-query',()=>({useQueryClient:()=>({invalidateQueries:m.invalidate}),useQuery:()=>({data:[{id:1,name_en:'Synthetic type'}]})}));
// Use the real TanStack cell renderer: calling cell() directly conceals the
// remount caused by a new column callback after the tab's state changes.
vi.mock('@/components/erp/table/erp-data-table',async()=>{
 const {flexRender}=await import('@tanstack/react-table');
 return {ERPDataTable:({data,columns}:TestTable)=><div>{data.map(row=><div key={row.id}>{flexRender(columns.find(c=>c.id==='actions')?.cell,{row:{original:row}})}</div>)}</div>};
});
vi.mock('@/components/erp/combobox',()=>({ERPCombobox:({value,ariaLabel,required}:{value?:number|string|null;ariaLabel?:string;required?:boolean})=><input aria-label={ariaLabel} required={required} value={value??''} readOnly/>}));
vi.mock('@/components/erp/geography',()=>({CountrySelect:()=>null,EmirateSelect:()=>null}));
vi.mock('@/components/erp/party-select',()=>({PartySelect:()=>null}));
vi.mock('@/components/erp/finance-basics',()=>({CurrencySelect:()=>null,BankSelect:()=>null,PaymentTermSelect:()=>null,TaxTypeSelect:()=>null}));
import {PartyContactsTab} from '@/features/master-data/parties/party-contacts-tab';
import {PartyBankDetailsTab} from '@/features/master-data/parties/party-bank-details-tab';
import {PartyLicensesTab} from '@/features/master-data/parties/party-licenses-tab';
import {PartyTaxFinanceTab} from '@/features/master-data/parties/party-tax-finance-tab';
import {PartyDocumentsTab} from '@/features/master-data/parties/party-documents-tab';
import {PartyNotesTab} from '@/features/master-data/parties/party-notes-tab';
const common={id:8,workspace_revision:4,party_id:4,is_active:false,is_primary:false,remarks:'Synthetic',created_by:7};
const cases=[
 {name:'contact',component:()=> <PartyContactsTab partyId={4}/>,button:'Edit record',row:{...common,full_name:'Synthetic contact',is_accounts_contact:false,is_sales_contact:false,is_operations_contact:false,is_hse_contact:false,is_documents_contact:false}},
 {name:'bank',component:()=> <PartyBankDetailsTab partyId={4} authContext={{isAccountActive:true,profile:{id:7},globalPermissionCodes:['master_data.parties.manage_bank_details']} as unknown as AuthContext}/>,button:'Edit record',row:{...common,account_holder_name:'Synthetic holder'}},
 {name:'licence',component:()=> <PartyLicensesTab partyId={4}/>,button:'Edit record',row:{...common,license_number:'Synthetic licence',license_type_id:1,license_status_id:1,renewal_required:false,renewal_notice_days:0}},
 {name:'tax',component:()=> <PartyTaxFinanceTab partyId={4} authContext={{isAccountActive:true,profile:{id:7},globalPermissionCodes:['master_data.parties.manage_tax','master_data.parties.view']} as unknown as AuthContext}/>,button:'Edit registration',row:{...common,tax_registration_number:'Synthetic tax',tax_type_id:1,tax_status_id:1,reverse_charge_applicable:false,vat_exempt:false}},
 {name:'document',component:()=> <PartyDocumentsTab partyId={4}/>,button:'Edit record',row:{...common,document_title:'Synthetic document',document_type_id:1,document_status_id:1,expiry_required:false,renewal_notice_days:0,issuing_authority_party_id:42}},
 {name:'note',component:()=> <PartyNotesTab partyId={4} canManage currentUserProfileId={7}/>,button:'Edit note',row:{...common,note_body:'Synthetic private note',note_title:'Synthetic title',is_private:true}},
];
beforeEach(()=>{vi.resetAllMocks();m.store=createWorkspaceDraftStore();m.update.mockImplementation(async input=>({success:true,data:{id:input.id,revision:'5',changed:true,replayed:false}}));});afterEach(cleanup);
const submit=()=>fireEvent.click(screen.getByRole('button',{name:'Save',exact:true}));
for(const c of cases){
 it(`${c.name} actual list opens archive and preserves the reviewed version`,async()=>{
  m.rows=[c.row];m.archive.mockResolvedValue({success:true,data:{id:8,revision:'5',changed:true,replayed:false,archived:true}});render(c.component());
  fireEvent.click(screen.getByRole('button',{name:'Archive record'}));expect(m.archive).not.toHaveBeenCalled();
  fireEvent.click(screen.getAllByRole('button',{name:'Archive record'}).at(-1)!);
  await waitFor(()=>expect(m.archive).toHaveBeenCalledOnce());expect(m.archive.mock.calls[0][1]).toBe(8);expect(m.archive.mock.calls[0][3].revision).toBe('4');await waitFor(()=>expect(m.invalidate).toHaveBeenCalled());
 });
 it(`${c.name} archived list record exposes restore and blocks editing`,()=>{
  m.rows=[{...c.row,archived_at:'2026-10-04T00:00:00Z'}];render(c.component());expect(screen.getByRole('button',{name:'Restore record'})).toBeTruthy();expect(screen.getByRole('button',{name:c.button,exact:true}).hasAttribute('disabled')).toBe(true);expect(screen.queryByRole('button',{name:'Archive record'})).toBeNull();
 });
 it(`${c.name} actual editor submits opening identity/revision and preserves its flags`,async()=>{
  m.rows=[c.row];render(c.component());fireEvent.click(screen.getByRole('button',{name:c.button,exact:true}));submit();
  await waitFor(()=>expect(m.update).toHaveBeenCalledTimes(1));expect(m.update.mock.calls[0][0]).toMatchObject({id:8,party_id:4});expect(m.update.mock.calls[0][1].revision).toBe('4');
  if(c.name==='note')expect(m.update.mock.calls[0][0].is_private).toBe(true);
  if(['contact','bank','licence','tax'].includes(c.name))expect(m.update.mock.calls[0][0].is_active).toBe(false);
  if(['licence','document'].includes(c.name))expect(m.update.mock.calls[0][0].renewal_notice_days).toBe(0);
  if(c.name==='document')expect(m.update.mock.calls[0][0].issuing_authority_party_id).toBe(42);
  await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());expect(m.invalidate).toHaveBeenCalled();
 });
 it(`${c.name} actual editor retries same uncertain operation and reports no-op truthfully`,async()=>{
  m.rows=[c.row];m.update.mockResolvedValueOnce({success:false,uncertain:true,error:'Lost response'}).mockResolvedValueOnce({success:true,data:{id:8,revision:'4',changed:false,replayed:true}});
  render(c.component());fireEvent.click(screen.getByRole('button',{name:c.button,exact:true}));submit();await waitFor(()=>expect(screen.getByRole('button',{name:'Cancel'}).hasAttribute('disabled')).toBe(true));submit();
  await waitFor(()=>expect(m.update).toHaveBeenCalledTimes(2));expect(m.update.mock.calls[1]).toEqual(m.update.mock.calls[0]);await waitFor(()=>expect(m.success).toHaveBeenCalledWith('No changes to save'));
 });
}
it('bank tab hides verification and editing for company-scoped capabilities on a shared record',()=>{
 m.rows=[{...common,account_holder_name:'Synthetic holder',is_verified:false}];
 render(<PartyBankDetailsTab partyId={4} authContext={{isAccountActive:true,profile:{id:7},permissionCodes:['master_data.parties.manage_bank_details','master_data.parties.verify_bank_details'],globalPermissionCodes:[],roleAssignments:[{ownerCompanyId:1,branchId:null}]} as unknown as AuthContext}/>);
 expect(screen.queryByRole('button',{name:'Verify bank details'})).toBeNull();expect(screen.queryByRole('button',{name:'Edit record'})).toBeNull();expect(screen.getByText('You do not have permission to view bank details.')).toBeTruthy();
});
it('bank tab exposes review to a global independent verifier but not bank editing',()=>{
 m.rows=[{...common,account_holder_name:'Synthetic holder',is_verified:false}];
 render(<PartyBankDetailsTab partyId={4} authContext={{isAccountActive:true,profile:{id:7},globalPermissionCodes:['master_data.parties.view_bank_details','master_data.parties.verify_bank_details']} as unknown as AuthContext}/>);
 expect(screen.getByRole('button',{name:'Verify bank details'})).toBeTruthy();expect(screen.queryByRole('button',{name:'Edit record'})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Verify bank details'}));expect(screen.getByRole('dialog')).toBeTruthy();expect(screen.getByRole('button',{name:'Confirm verification'})).toBeTruthy();
});
it('bank tab does not allow verification while its parent workspace is read-only',()=>{
 m.rows=[{...common,account_holder_name:'Synthetic holder',is_verified:false}];
 render(<PartyBankDetailsTab partyId={4} disabled authContext={{isAccountActive:true,profile:{id:7},globalPermissionCodes:['master_data.parties.manage_bank_details','master_data.parties.verify_bank_details']} as unknown as AuthContext}/>);
 expect(screen.queryByRole('button',{name:'Verify bank details'})).toBeNull();expect(screen.queryByRole('button',{name:'Edit record'})).toBeNull();
});
