// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createWorkspaceDraftStore } from '@/lib/workspace/workspace-draft-store';
const ctx=vi.hoisted(()=>({store:null as ReturnType<typeof createWorkspaceDraftStore>|null,dispatch:vi.fn()}));
vi.mock('next/navigation',()=>({usePathname:()=>'/test',useRouter:()=>({refresh:vi.fn()})}));
vi.mock('@/components/workspace/workspace-provider',()=>({useWorkspaceContext:()=>({state:{activeTabId:'owner',tabs:[{id:'owner',route:'/test'}]},dispatch:ctx.dispatch})}));
vi.mock('@/components/workspace/workspace-draft-provider',()=>({useWorkspaceDraftStoreContext:()=>ctx.store}));
vi.mock('@/hooks/use-workspace-form-navigation',()=>({useWorkspaceFormNavigation:()=>({activeTab:{id:'owner'},markDirty:vi.fn(),closeTab:vi.fn(),renameTab:vi.fn(),updateTabRoute:vi.fn()})}));
vi.mock('@/components/workspace/erp-record-workspace-form',()=>({ERPRecordWorkspaceForm:({children}:any)=><div>{children}</div>,ERPRecordSectionPanel:({children}:any)=><section>{children}</section>}));
vi.mock('@/server/actions/dms/documents',()=>({createDmsDocument:vi.fn(),updateDmsDocument:vi.fn()}));
vi.mock('@/server/actions/dms/entity-documents',()=>({linkDmsDocumentToEntity:vi.fn()}));
vi.mock('@/features/dms/documents/sections/dms-document-ai-section',()=>({DmsDocumentAiSection:()=>null}));
vi.mock('@/features/dms/documents/sections/dms-document-ai-summary-section',()=>({DmsDocumentAiSummarySection:()=>null}));
vi.mock('@/features/dms/documents/sections/dms-document-approvals-section',()=>({DmsDocumentApprovalsSection:()=>null}));
vi.mock('@/features/dms/documents/sections/dms-document-ask-ai-section',()=>({DmsDocumentAskAiSection:()=>null}));
vi.mock('@/features/dms/documents/sections/dms-document-audit-section',()=>({DmsDocumentAuditSection:()=>null}));
vi.mock('@/features/dms/documents/sections/dms-document-comments-section',()=>({DmsDocumentCommentsSection:()=>null}));
vi.mock('@/features/dms/documents/sections/dms-document-content-section',()=>({DmsDocumentContentSection:()=>null}));
vi.mock('@/features/dms/documents/sections/dms-document-expiry-section',()=>({DmsDocumentExpirySection:()=>null}));
vi.mock('@/features/dms/documents/sections/dms-document-files-section',()=>({DmsDocumentFilesSection:()=>null}));
vi.mock('@/features/dms/documents/sections/dms-document-intelligence-section',()=>({DmsDocumentIntelligenceSection:()=>null}));
vi.mock('@/features/dms/documents/sections/dms-document-links-section',()=>({DmsDocumentLinksSection:()=>null}));
vi.mock('@/features/dms/documents/sections/dms-document-metadata-section',()=>({DmsDocumentMetadataSection:()=>null}));
vi.mock('@/features/dms/documents/sections/dms-document-ocr-section',()=>({DmsDocumentOcrSection:()=>null}));
vi.mock('@/features/dms/documents/sections/dms-document-semantic-section',()=>({DmsDocumentSemanticSection:()=>null}));
vi.mock('@/features/dms/documents/sections/dms-document-tags-section',()=>({DmsDocumentTagsSection:()=>null}));
vi.mock('@/features/dms/documents/sections/dms-document-understanding-section',()=>({DmsDocumentUnderstandingSection:()=>null}));
vi.mock('@/features/dms/documents/sections/dms-document-versions-section',()=>({DmsDocumentVersionsSection:()=>null}));
vi.mock('@/features/dms/documents/sections/dms-document-overview-section',()=>({DmsDocumentOverviewSection:(p:any)=><div>
 {['documentTypeId','categoryId','owningCompanyId','owningBranchId','partyId'].map(key=><output key={key} data-testid={key}>{p[key]??'empty'}</output>)}
 <button type="button" onClick={()=>p.setOwningCompanyId(2)}>Change company</button></div>}));
import { DmsDocumentRecordForm } from '@/features/dms/documents/dms-document-record-form';
const doc:any={id:500,document_type_id:1,category_id:2,owning_company_id:1,owning_branch_id:4,party_id:5};
const mount=()=>render(<DmsDocumentRecordForm doc={doc} mode="edit" authContext={{permissionCodes:[],roleCodes:[]} as any} documentTypes={[]} categories={[]}/>);
beforeEach(()=>{ctx.store=createWorkspaceDraftStore();});
afterEach(cleanup);
it('all five cleared DMS relationship selections stay cleared instead of restoring server values',()=>{
 for(const key of ['document_type_id','category_id','owning_company_id','owning_branch_id','party_id'])ctx.store!.writeField('draft:tab:owner:dms-doc-workspace-form',key,'');
 const ui=mount();for(const key of ['documentTypeId','categoryId','owningCompanyId','owningBranchId','partyId'])expect(ui.getByTestId(key).textContent).toBe('empty');
});
it('company change clears branch in both the live controller and the remounted draft',()=>{
 const first=mount();fireEvent.click(first.getByText('Change company'));expect(first.getByTestId('owningBranchId').textContent).toBe('empty');first.unmount();
 const next=mount();expect(next.getByTestId('owningCompanyId').textContent).toBe('2');expect(next.getByTestId('owningBranchId').textContent).toBe('empty');
});
