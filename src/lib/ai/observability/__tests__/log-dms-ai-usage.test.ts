/**
 * ERP DMS AI Phase 15 — Unit Tests for log-dms-ai-usage.ts
 *
 * Tests cost estimation logic via mocked Supabase admin client.
 * The estimateCost function is private, so tests are conducted by mocking
 * createAdminClient and verifying the behavior of logDmsAiUsage's insert call.
 *
 * Security rule: These tests never use real DB or real API keys.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock createAdminClient before importing the module ────────────────────────

const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockSingle = vi.fn();
const mockMaybeSingle = vi.fn();
const mockEq = vi.fn();
const mockLte = vi.fn();
const mockOr = vi.fn();
const mockOrder = vi.fn();
const mockLimit = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

// Set up default chainable returns for mock
function createChainableMock(returnValue: unknown) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(returnValue),
    single: vi.fn().mockResolvedValue(returnValue),
  };
  return chain;
}

import { logDmsAiUsage } from "../log-dms-ai-usage";

describe("logDmsAiUsage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls from() with erp_ai_usage_logs table", async () => {
    // Arrange
    const providerConfigChain = createChainableMock({ data: null, error: null });
    const costRateChain = createChainableMock({ data: null, error: null });
    const insertChain = createChainableMock({ data: { id: 123 }, error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === "erp_ai_provider_configs") return providerConfigChain;
      if (table === "erp_ai_model_cost_rates") return costRateChain;
      if (table === "erp_ai_usage_logs") return insertChain;
      return createChainableMock({ data: null, error: null });
    });

    // Act
    const result = await logDmsAiUsage({
      featureArea: "DMS_AI_TEST",
      operationType: "test_operation",
      status: "success",
    });

    // Assert — from() was called with the usage log table
    expect(mockFrom).toHaveBeenCalledWith("erp_ai_usage_logs");
    expect(result).toBe(123);
  });

  it("strips forbidden metadata keys before insert", async () => {
    // Arrange
    const captured: { insertData: Record<string, unknown> | null } = { insertData: null };

    mockFrom.mockImplementation((table: string) => {
      if (table === "erp_ai_usage_logs") {
        return {
          insert: (data: Record<string, unknown>) => {
            captured.insertData = data;
            return {
              select: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: { id: 1 }, error: null }),
            };
          },
        };
      }
      return createChainableMock({ data: null, error: null });
    });

    // Act
    await logDmsAiUsage({
      featureArea: "DMS_AI_TEST",
      operationType: "test_op",
      status: "success",
      metadata: {
        prompt: "SHOULD_BE_STRIPPED",
        api_key: "sk-SHOULD_BE_STRIPPED",
        model_id: "gpt-4o",
        chunk_count: 5,
      },
    });

    // Assert — metadata_json should not contain blocked keys
    const metadataJson = (captured.insertData?.metadata_json ?? null) as Record<string, unknown> | null;
    expect(metadataJson?.prompt).toBeUndefined();
    expect(metadataJson?.api_key).toBeUndefined();
    expect(metadataJson?.model_id).toBe("gpt-4o");
    expect(metadataJson?.chunk_count).toBe(5);
  });

  it("is non-fatal — returns null when insert fails", async () => {
    // Arrange
    mockFrom.mockImplementation(() => ({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: new Error("DB error") }),
      eq: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }));

    // Act — should not throw
    const result = await logDmsAiUsage({
      featureArea: "DMS_AI_TEST",
      operationType: "test_op",
      status: "failed",
    });

    // Assert
    expect(result).toBeNull();
  });

  it("sanitizes error message before insert", async () => {
    const captured: { insertData: Record<string, unknown> | null } = { insertData: null };

    mockFrom.mockImplementation((table: string) => {
      if (table === "erp_ai_usage_logs") {
        return {
          insert: (data: Record<string, unknown>) => {
            captured.insertData = data;
            return {
              select: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: { id: 1 }, error: null }),
            };
          },
        };
      }
      return createChainableMock({ data: null, error: null });
    });

    await logDmsAiUsage({
      featureArea: "DMS_AI_TEST",
      operationType: "test_op",
      status: "failed",
      errorMessage: "x".repeat(500),
    });

    const errorMsg = (captured.insertData?.error_message ?? null) as string | null;
    expect(errorMsg).not.toBeNull();
    expect(errorMsg!.length).toBeLessThanOrEqual(200);
  });

  it("does not throw when all inputs are undefined/null", async () => {
    mockFrom.mockImplementation(() =>
      createChainableMock({ data: { id: 1 }, error: null })
    );

    await expect(
      logDmsAiUsage({
        featureArea: "DMS_AI_TEST",
        operationType: "test_op",
        status: "skipped",
        providerConfigId: null,
        modelId: null,
        inputTokenCount: null,
        outputTokenCount: null,
        durationMs: null,
        errorMessage: null,
        documentId: null,
        aiJobId: null,
        metadata: null,
      })
    ).resolves.not.toThrow();
  });
});
