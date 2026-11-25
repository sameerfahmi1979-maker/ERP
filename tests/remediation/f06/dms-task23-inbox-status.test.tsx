// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { DmsUploadSessionRow } from '@/server/actions/dms/upload-sessions';
import { DmsUploadInboxPageClient } from '@/features/dms/upload/dms-upload-inbox-page-client';

const mocks = vi.hoisted(() => ({
  ai: vi.fn(), status: vi.fn(), push: vi.fn(), success: vi.fn(), error: vi.fn(),
  ownerLive: true, owner: { identity: { authUserId: 'synthetic', scopeVersion: 'one' }, generation: 1, admits: () => true },
}));
vi.mock('@/components/layout/read-cache-boundary', () => ({ useReadCacheOwner: () => mocks.owner }));
vi.mock('@/hooks/use-dms-batch-admission', () => ({ useDmsBatchAdmission: () => ({ failureId: 0, busy: false }) }));
vi.mock('@/hooks/use-dms-single-upload-admission', () => ({ useDmsSingleUploadAdmission: () => ({ pending: false }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('sonner', () => ({ toast: { success: mocks.success, info: vi.fn(), error: mocks.error } }));
vi.mock('@/server/actions/dms/ai-intake', () => ({ startAiIntakeFromUploadSession: mocks.ai }));
vi.mock('@/server/actions/dms/upload-sessions', () => ({
  cancelDmsUploadSession: vi.fn(), createDmsUploadSession: vi.fn(), completeDmsTempUpload: vi.fn(),
  acknowledgeDmsSingleUpload: vi.fn(),
}));
vi.mock('@/features/dms/admin/dms-admin-file-storage-panel', () => ({ DmsAdminFileStoragePanel: () => null }));
vi.mock('@/features/dms/upload/dms-upload-scope-picker', () => ({ DmsUploadScopePicker: () => null }));
vi.mock('@/features/dms/upload/dms-create-document-from-upload-dialog', () => ({ DmsCreateDocumentFromUploadDialog: () => null }));
vi.mock('@/features/dms/upload/dms-duplicate-warning-panel', () => ({ DmsDuplicateWarningPanel: () => null }));
vi.mock('@/features/dms/upload/dms-upload-attach-dialog', () => ({ DmsUploadAttachDialog: () => null }));
vi.mock('@/features/dms/upload/dms-upload-cleanup-panel', () => ({ DmsUploadCleanupPanel: () => null }));
vi.mock('@/features/dms/upload/dms-upload-dropzone', () => ({ DmsUploadDropzone: () => null }));
vi.mock('@/features/dms/upload/dms-upload-session-table', () => ({
  DmsUploadSessionTable: ({ sessions, onAiFill }: {
    sessions: DmsUploadSessionRow[]; onAiFill: (session: DmsUploadSessionRow) => void;
  }) => sessions.map(session => <button key={session.id} onClick={() => onAiFill(session)}>{session.session_code}</button>),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { resolve, promise };
}

const sessions = [
  { id: 3, session_code: 'FIRST', original_filename: 'One.pdf', file_size_bytes: 3174, status: 'uploaded' },
  { id: 4, session_code: 'SECOND', original_filename: 'Two.pdf', file_size_bytes: 3174, status: 'uploaded' },
] as DmsUploadSessionRow[];

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DmsUploadInboxPageClient initialSessions={sessions} documents={[]} documentTypes={[]} />
    </QueryClientProvider>,
  );
}

function start(code = 'FIRST') { fireEvent.click(screen.getByRole('button', { name: code })); }
function advance(ms: number) { return act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mocks.ownerLive = true;
  mocks.owner.admits = () => mocks.ownerLive;
  Object.assign(mocks.owner, { isLive: () => mocks.ownerLive });
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.stubGlobal('fetch', mocks.status);
  mocks.ai.mockImplementation(() => new Promise(() => {}));
  mocks.status.mockImplementation(() => new Promise(() => {}));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('avoids hidden status reads and never overlaps visible reads for one intake', async () => {
  vi.mocked(Object.getOwnPropertyDescriptor(document, 'visibilityState')!.get!).mockReturnValue('hidden');
  const view = mount();
  start();
  await advance(8_000);
  expect(mocks.status).not.toHaveBeenCalled();
  vi.mocked(Object.getOwnPropertyDescriptor(document, 'visibilityState')!.get!).mockReturnValue('visible');
  await advance(12_000);
  expect(mocks.status).toHaveBeenCalledOnce();
  const signal = mocks.status.mock.calls[0][1].signal as AbortSignal;
  expect(signal.aborted).toBe(false);
  view.unmount();
  expect(signal.aborted).toBe(true);
});

it('ignores ready status from an intake request displaced by a new session', async () => {
  const oldStatus = deferred<Response>();
  mocks.status.mockReturnValueOnce(oldStatus.promise);
  mount();
  start();
  await advance(4_000);
  start('SECOND');
  await act(async () => oldStatus.resolve(Response.json({ intakeStatus: 'review_pending', sessionCode: 'FIRST' })));
  await advance(11_000);
  expect(mocks.push).not.toHaveBeenCalled();
});

it('ignores a late server action when the authenticated cache owner is retired', async () => {
  const action = deferred<{ success: boolean; data: { status: string; sessionCode: string } }>();
  mocks.ai.mockReturnValueOnce(action.promise);
  mount();
  start();
  mocks.ownerLive = false;
  await act(async () => action.resolve({ success: true, data: { status: 'review_pending', sessionCode: 'FIRST' } }));
  expect(mocks.push).not.toHaveBeenCalled();
  expect(mocks.success).not.toHaveBeenCalled();
});

it('stops status reads on confirmed readiness and opens review once after the action settles', async () => {
  const action = deferred<{ success: boolean; data: { status: string; sessionCode: string } }>();
  mocks.ai.mockReturnValueOnce(action.promise);
  mocks.status.mockResolvedValue(Response.json({ intakeStatus: 'review_pending', sessionCode: 'FIRST' }));
  mount();
  start();
  await advance(8_000);
  expect(mocks.status).toHaveBeenCalledOnce();
  expect(mocks.push).not.toHaveBeenCalled();
  await act(async () => action.resolve({ success: true, data: { status: 'review_pending', sessionCode: 'FIRST' } }));
  expect(mocks.push).toHaveBeenCalledExactlyOnceWith('/dms/intake/FIRST');
});
