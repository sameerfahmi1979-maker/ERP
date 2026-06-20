/**
 * ERP COMMON AI.7 — AI Assistant Library
 *
 * This barrel only exports types and client-safe utilities.
 * Server-only modules (action-handlers, assistant-engine, intent-extractor) are
 * imported directly by server actions — NOT from this barrel.
 */

export * from "./types";
export * from "./action-registry";
export { sanitizeForStorage, sanitizeAssistantText } from "./response-builder";
