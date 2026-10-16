// @vitest-environment jsdom
// Real drawer and target selector; DAL, unrelated panels and final writer doubled.
import '../f05/setup';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import type {ReviewQueueItem} from '@/server/actions/dms/review-queue';
const m=vi.hoisted(()=>({rows:vi.fn(),table:vi.fn()}));
vi.mock('@/server/actions/dms/apply-to-erp',()=>({getPartyApplyTargetRows:m.rows}));
vi.mock('@/server/actions/dms/review-queue',()=>({assignDmsReviewQueueItem:vi.fn(),startDmsReviewQueueItem:vi.fn(),resolveDmsReviewQueueItem:vi.fn(),dismissDmsReviewQueueItem:vi.fn()}));
vi.mock('@/server/actions/dms/validation',()=>({reviewDmsValidationFinding:vi.fn(),markDmsValidationFindingFalsePositive:vi.fn()}));
vi.mock('@/server/actions/dms/entity-matching',()=>({reviewDmsEntityMatchCandidate:vi.fn()}));
vi.mock('@/features/dms/apply-to-erp',async()=>({DmsApplyToErpPreview:()=>null,DmsPartyTargetSelector:(await import('@/features/dms/apply-to-erp/dms-party-target-selector')).DmsPartyTargetSelector}));
vi.mock('@/features/dms/admin/dms-ai-metadata-suggestions-dialog',()=>({DmsAiMetadataSuggestionsDialog:()=>null}));
vi.mock('@/features/dms/apply-to-erp/party-document-review-fields',()=>({PartyDocumentReviewFields:({row,onApplied}:{row:{workspace_revision:string};onApplied:()=>void})=><div>Reviewed revision {row.workspace_revision}<button onClick={onApplied}>Simulate confirmed commit</button></div>}));
vi.mock('@/components/erp/table/erp-data-table',()=>({ERPDataTable:(props:unknown)=>{m.table(props);return null;}}));
import {DmsReviewQueueItemDrawer} from '@/features/dms/review-queue/dms-review-queue-item-drawer';
import {DmsApplyToErpItemTable} from '@/features/dms/apply-to-erp/dms-apply-to-erp-item-table';
const item={id:7,documentId:3,reviewType:'party_matching_review',status:'open',priority:'normal',reasonMessage:'Synthetic',queuedAt:'2026-10-04T08:00:00Z',createdAt:'2026-10-04T08:00:00Z',updatedAt:'2026-10-04T08:00:00Z',entityMatchCandidateId:8,entityMatchCandidate:{id:8,targetEntityType:'party',targetEntityId:4,targetDisplayName:'Synthetic party',status:'accepted',matchScore:null},confidence:null,payloadJson:null} as ReviewQueueItem;
beforeEach(()=>{vi.resetAllMocks();let revision=0;m.rows.mockImplementation(async()=>({success:true,data:[{id:5,party_id:4,workspace_revision:String(++revision),license_code:'F06',license_number:'Synthetic Licence',is_active:true}]}));});afterEach(cleanup);
it('successful application refreshes the existing selector before another review',async()=>{
 render(<DmsReviewQueueItemDrawer item={item} canManage onClose={vi.fn()} onMutated={vi.fn()}/>);
 fireEvent.click(await screen.findByRole('button',{name:'[F06] Synthetic Licence Active'}));expect(screen.getByText('Reviewed revision 1')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Simulate confirmed commit'}));await waitFor(()=>expect(m.rows).toHaveBeenCalledTimes(2));
 fireEvent.click(await screen.findByRole('button',{name:'[F06] Synthetic Licence Active'}));expect(screen.getByText('Reviewed revision 2')).toBeTruthy();
});
it('proposal table has only its write-selection controls, not an unrelated second selection model',()=>{
 render(<DmsApplyToErpItemTable items={[]} selectedIndices={new Set()} onToggle={vi.fn()}/>);expect(m.table.mock.calls.at(-1)?.[0]).toMatchObject({enableRowSelection:false});
});
