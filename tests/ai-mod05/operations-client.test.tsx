// @vitest-environment jsdom
import type { ComponentProps } from 'react';
import {afterEach,beforeEach,expect,it,vi}from 'vitest';import {act,cleanup,fireEvent,render,screen,waitFor,within}from '@testing-library/react';
import {ReadCacheBoundary}from '@/components/layout/read-cache-boundary';import {AiQualityPanel}from '@/features/ai/quality/ai-quality-panel';
import type { ERPChildDialogForm } from '@/components/erp/erp-child-dialog-form';
import type { QualityDatasetRow } from '@/lib/ai/quality/contracts';
const m=vi.hoisted(()=>({get:vi.fn(),control:vi.fn(),approve:vi.fn(),run:vi.fn()}));
vi.mock('@/server/actions/ai/quality',()=>({getAiQualitySnapshot:m.get,saveAiOperationControl:m.control,reviewAiFeedback:vi.fn(),approveAiQualityVersion:m.approve,saveAiEvaluationDataset:vi.fn(),runAiQualityEvaluation:m.run,holdAiUncertainTurn:vi.fn()}));
vi.mock('@/components/erp/erp-child-dialog-form',()=>({ERPChildDialogForm:({open,children,onSubmit,onCancel,closeDisabled,submitLabel,submitDisabled}:ComponentProps<typeof ERPChildDialogForm>)=>open?<div role="dialog">{children}<button disabled={closeDisabled} onClick={onCancel}>Cancel control</button><button disabled={submitDisabled} onClick={onSubmit}>{submitLabel}</button></div>:null}));
const operations={asOf:'2026-11-01T00:00:00Z',controls:[],versions:{contract:'erp-ai/1',preparation:'dms-preparation/1'},queue:{queued:1,running:2},usage:{calls:3,knownCostUsd:0.1,unknownCostCalls:2,inputTokens:4,outputTokens:null,unknownTokenCalls:2,latencySample:1,averageLatencyMs:10},profiles:{active:0,stale:0,draft:1},companies:[],models:[],freshness:{lastIndexUpdate:null,pendingChunks:0,failedChunks:0,pendingReviews:0},heldTurns:[]};
const snapshot={feedback:[],datasets:[],evaluations:[],hasMore:{feedback:false,datasets:false,evaluations:false},canOperate:true,canEvaluate:false,operations};
const view=(actor='synthetic-one')=><ReadCacheBoundary authUserId={actor} scopeVersion="one"><AiQualityPanel/></ReadCacheBoundary>;
beforeEach(()=>{vi.clearAllMocks();m.get.mockResolvedValue({success:true,data:snapshot});m.control.mockResolvedValue({success:true,data:{id:1,replayed:false}});});afterEach(cleanup);
it('labels partial costs/tokens and never equates confidence with accuracy',async()=>{render(view());expect(await screen.findByText(/2 calls have unknown cost/)).toBeTruthy();expect(screen.getByText(/2 calls have incomplete token counts/)).toBeTruthy();expect(screen.getByText(/not factual accuracy/)).toBeTruthy();});
it('keeps missing-release failures visible instead of claiming no findings',async()=>{m.get.mockResolvedValue({success:false,error:'Matching database release required'});render(view());await screen.findByText('Matching database release required');expect(screen.queryByText(/No currently permitted feedback/)).toBeNull();});
it('passes explicit model/profile filters to the authorized server worklist',async()=>{render(view());await screen.findByText('Feedback review');fireEvent.change(screen.getByLabelText('Profile filter'),{target:{value:'SYN-PROFILE'}});fireEvent.change(screen.getByLabelText('Model filter'),{target:{value:'SYN-MODEL'}});fireEvent.click(screen.getByText('Apply feedback filters'));await waitFor(()=>expect(m.get).toHaveBeenLastCalledWith({profile:'SYN-PROFILE',model:'SYN-MODEL'}));});
it('an uncertain control holds its original values and cannot close/edit before recovery',async()=>{m.control.mockResolvedValueOnce({success:false,uncertain:true,error:'Original control unconfirmed'});render(view());await screen.findByText('Change processing controls');fireEvent.click(screen.getByText('Change processing controls'));fireEvent.change(screen.getByLabelText('Reason'),{target:{value:'SYNTHETIC pause'}});fireEvent.click(screen.getByLabelText('Pause new processing admissions'));fireEvent.click(screen.getByText('Apply reviewed controls'));await screen.findByText('Recover original request');expect((screen.getByText('Cancel control')as HTMLButtonElement).disabled).toBe(true);expect((screen.getByLabelText('Reason')as HTMLInputElement).matches(':disabled')).toBe(true);fireEvent.click(screen.getByText('Recover original request'));await waitFor(()=>expect(m.control).toHaveBeenCalledTimes(2));expect(m.control.mock.calls[0][0]).toEqual(m.control.mock.calls[1][0]);expect(m.control.mock.calls[0][0]).toMatchObject({paused:true,expectedRevision:0,companyId:null,dailyUsd:null});});
it('account changes retire both late review data and previous operational state',async()=>{let finish!:(v:unknown)=>void;m.get.mockImplementationOnce(()=>new Promise(r=>{finish=r;}));const ui=render(view());ui.rerender(view('synthetic-two'));await screen.findByText('Feedback review');await act(async()=>finish({success:true,data:{...snapshot,feedback:[{id:1,reference:'AI-FB-PRIVATE',source:{kind:'assistant',id:1,documentId:null},category:'wrong_person',correction:'PRIVATE synthetic old actor',state:'pending',createdAt:'2026-11-01',canReview:false,provenance:{}}]}}));expect(screen.queryByText('PRIVATE synthetic old actor')).toBeNull();});

const reviewDataset: QualityDatasetRow = {
  id: 14,
  reference: 'AI-DS-000014',
  definition: {
    code: 'SYNTHETIC-REVIEW',
    revision: 2,
    title: 'Synthetic reference review',
    minimized: true,
    feedbackIds: [],
    cases: [
      {caseId: 'SYN-AR-1', language: 'ar', category: 'incorrect_value', expected: 'رمز الاختبار ٠٠٧', evidence: ['SYN-REF-002', 'SYN-REF-001'], critical: true},
      {caseId: 'SYN-EN-2', language: 'en', category: 'missing_result', expected: 'SYN-NO-MATCH', evidence: [], critical: false},
    ],
  },
  sha256: 'd'.repeat(64),
  state: 'draft',
  canApprove: true,
};

it('shows the exact minimized cases before an independent reviewer approves that revision', async () => {
  m.get.mockResolvedValue({success: true, data: {...snapshot, canEvaluate: true, datasets: [reviewDataset]}});
  m.approve.mockResolvedValue({success: true, data: {id: 14, replayed: false}});
  render(view());
  const review = await screen.findByText('Review minimized cases');
  expect(screen.queryByText('رمز الاختبار ٠٠٧')).toBeNull();
  expect(screen.queryByRole('button', {name: 'Approve minimized cases'})).toBeNull();
  fireEvent.click(review);
  const expanded = within(review.closest('details')!);
  await expanded.findByText('رمز الاختبار ٠٠٧');
  expect(expanded.getByText('d'.repeat(64))).toBeTruthy();
  const [arabic, english] = expanded.getAllByRole('heading', {level: 4});
  expect(arabic.textContent).toBe('SYN-AR-1');
  expect(english.textContent).toBe('SYN-EN-2');
  expect(expanded.getByText(/Arabic · Incorrect value/)).toBeTruthy();
  expect(expanded.getByText('Critical')).toBeTruthy();
  const evidence = expanded.getByText('SYN-REF-002').closest('ul')!;
  expect(within(evidence).getAllByRole('listitem').map(item => item.textContent)).toEqual(['SYN-REF-002', 'SYN-REF-001']);
  expect(expanded.getByText('SYN-NO-MATCH')).toBeTruthy();
  expect(expanded.getByText('No expected evidence references')).toBeTruthy();
  expect(expanded.getByText('Noncritical')).toBeTruthy();
  fireEvent.click(expanded.getByRole('button', {name: 'Approve minimized cases'}));
  await waitFor(() => expect(m.approve).toHaveBeenCalledWith({kind: 'dataset', id: 14}));
});

it('allows case inspection without offering approval when the snapshot withholds approval authority', async () => {
  m.get.mockResolvedValue({success: true, data: {...snapshot, canEvaluate: true, datasets: [{...reviewDataset, canApprove: false}]}});
  render(view());
  fireEvent.click(await screen.findByText('Review minimized cases'));
  await screen.findByText('رمز الاختبار ٠٠٧');
  expect(screen.queryByRole('button', {name: 'Approve minimized cases'})).toBeNull();
});

it('records observations with the retained case ID and exact evidence lines', async () => {
  const referenceCase = {...reviewDataset.definition.cases[0], caseId: ' SYN-AR-1 '};
  const dataset = {...reviewDataset, state: 'approved', canApprove: false, definition: {...reviewDataset.definition, cases: [referenceCase]}};
  m.get.mockResolvedValue({success: true, data: {...snapshot, canEvaluate: true, datasets: [dataset]}});
  m.run.mockResolvedValue({success: true, data: {id: 15, replayed: false}});
  render(view());
  fireEvent.click(await screen.findByRole('button', {name: 'Record candidate results'}));
  fireEvent.change(screen.getByLabelText('Prompt version'), {target: {value: 'synthetic/1'}});
  fireEvent.change(screen.getByLabelText('Rules version'), {target: {value: 'synthetic/2'}});
  fireEvent.change(screen.getByLabelText('Actual observed fact / outcome'), {target: {value: ' رمز الاختبار ٠٠٧ '}});
  const evidence = screen.getByLabelText('Actual evidence references (one per line)');
  fireEvent.change(evidence, {target: {value: ' SYN,REF-002 \n'}});
  expect((evidence as HTMLTextAreaElement).value).toBe(' SYN,REF-002 \n');
  fireEvent.change(evidence, {target: {value: ' SYN,REF-002 \nSYN-REF-001'}});
  fireEvent.click(screen.getByRole('button', {name: 'Retain comparison results'}));
  await waitFor(() => expect(m.run).toHaveBeenCalledWith(expect.objectContaining({
    datasetId: 14,
    observations: [{caseId: ' SYN-AR-1 ', actual: ' رمز الاختبار ٠٠٧ ', evidence: [' SYN,REF-002 ', 'SYN-REF-001']}],
  })));
});
