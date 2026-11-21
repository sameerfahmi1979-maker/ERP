import { describe, expect, it, vi } from 'vitest';
import { buildEntityLink } from '@/lib/ai/common/data-quality/route-links';

vi.mock('@/server/actions/ai/common/search', () => ({ searchAcrossErp: vi.fn() }));
vi.mock('@/server/actions/dms/document-understanding', () => ({ getDmsDocumentUnderstanding: vi.fn() }));
vi.mock('@/server/actions/ai/common/risk-scoring', () => ({ getRiskScoreForEntity: async () => ({ success: true }) }));
vi.mock('@/lib/ai/common/assistant/handler-queries', () => ({
  getComplianceFindingsForHandler: async () => [],
  getDuplicateCandidatesForHandler: async () => [],
}));
vi.mock('@/lib/ai/common/assistant/entity-access', () => ({
  normalizeAssistantReference: vi.fn(),
  readAuthorizedAssistantEntity: async (entityType: string, entityId: number) => ({
    reference: { entityType, entityId }, label: 'Synthetic subject',
  }),
}));

import { runShowNextActionsAction } from '@/lib/ai/common/assistant/action-handlers';

describe('field suggestion navigation', () => {
  const nextActions: Parameters<typeof runShowNextActionsAction>[0] = {
    intentType: 'show_next_actions', candidateActions: ['SHOW_NEXT_ACTIONS'], confidence: 'high',
  };

  it('omits the standalone suggestions destination from assistant recommendations', async () => {
    const result = await runShowNextActionsAction(nextActions);
    expect(result.navigationLinks).toEqual([]);
  });

  it.each([
    ['company', '/admin/organizations/record/42'],
    ['party', '/admin/master-data/parties/record/42'],
  ])('links an authorized %s subject to its implemented record', async (targetEntityType, route) => {
    const result = await runShowNextActionsAction({ ...nextActions, targetEntityType, targetEntityId: 42 });
    expect(result.navigationLinks).toEqual([expect.objectContaining({ route })]);
  });

  it('does not confuse a field suggestion row id with its source entity id', () => {
    expect(buildEntityLink('ai_field_suggestion', 42)).toBeNull();
  });
});
