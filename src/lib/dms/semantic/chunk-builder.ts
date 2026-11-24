/**
 * ERP DMS AI Phase 11 — Semantic Chunk Builder
 *
 * Deterministic, paragraph-aware sliding-window chunker for DMS document text.
 * Splits dms_document_content.content_text into overlapping SemanticChunkDraft[].
 *
 * Security rules:
 *   - No external calls, no DB access, no API calls.
 *   - No logging of chunk text.
 *   - Pure function — same input always produces same output.
 */

import { createHash } from "crypto";

// ── Constants ──────────────────────────────────────────────────────────────────

/** Target chunk size in characters (≈ 1 000 tokens). */
const TARGET_CHUNK_CHARS = 4_000;
/** Hard cap per chunk — very long paragraphs are split at this boundary. */
const MAX_CHUNK_CHARS = 6_000;
/** Overlap between consecutive chunks in characters. */
const OVERLAP_CHARS = 200;
/** Chunks shorter than this are discarded. */
const MIN_CHUNK_CHARS = 100;
/** Documents shorter than this produce exactly one short_document chunk. */
const SHORT_DOCUMENT_THRESHOLD = 200;
/** Maximum chunks per document (cost guard). */
const MAX_CHUNKS_PER_DOCUMENT = 200;

// ── Types ──────────────────────────────────────────────────────────────────────

export interface BuildSemanticChunksInput {
  documentId:  number;
  contentId:   number | null;
  contentText: string;
  contentHash: string;
  isTruncated?: boolean;
  preserveSourceText?: boolean;
}

export interface SemanticChunkDraft {
  documentId:    number;
  contentId:     number | null;
  chunkIndex:    number;
  chunkText:     string;
  chunkHash:     string;
  contentHash:   string;
  sourceKind:    "document_content" | "truncated_content" | "short_document";
  tokenEstimate: number;
  charCount:     number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Normalise line endings and collapse excessive whitespace within paragraphs.
 * Preserves paragraph boundaries (double newlines).
 */
function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")  // collapse triple+ newlines to double
    .trim();
}

function splitsSurrogatePair(text: string, index: number): boolean {
  const before = text.charCodeAt(index - 1);
  const after = text.charCodeAt(index);
  return before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff;
}

/** Keep ordered slices of the retained text so publication can verify each chunk in SQL. */
function buildSourceSlices(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length && chunks.length < MAX_CHUNKS_PER_DOCUMENT) {
    const target = start + TARGET_CHUNK_CHARS;
    let end = Math.min(start + MAX_CHUNK_CHARS, text.length);
    if (target < text.length) {
      const paragraphEnd = Math.max(text.lastIndexOf("\n\n", target), text.lastIndexOf("\r\n\r\n", target));
      if (paragraphEnd >= start + OVERLAP_CHARS + MIN_CHUNK_CHARS) end = paragraphEnd;
    }
    if (splitsSurrogatePair(text, end)) end--;
    const chunk = text.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end === text.length) break;
    start = end - OVERLAP_CHARS;
    if (splitsSurrogatePair(text, start)) start++;
  }
  return chunks;
}

/**
 * Split text into paragraphs at double-newline boundaries.
 * Returns non-empty paragraphs only.
 */
function splitIntoParagraphs(text: string): string[] {
  return text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/**
 * Hard-split a single oversized paragraph at sentence boundaries or character limit.
 * Returns an array of strings each <= MAX_CHUNK_CHARS.
 */
function splitOversizedParagraph(para: string): string[] {
  if (para.length <= MAX_CHUNK_CHARS) return [para];

  const parts: string[] = [];
  // Try sentence splits first (period/exclamation/question followed by space)
  const sentences = para.match(/[^.!?]+[.!?]+\s*/g) ?? [];

  if (sentences.length > 1) {
    let current = "";
    for (const sentence of sentences) {
      if ((current + sentence).length > MAX_CHUNK_CHARS && current.length > 0) {
        parts.push(current.trim());
        current = sentence;
      } else {
        current += sentence;
      }
    }
    if (current.trim().length > 0) parts.push(current.trim());
    if (parts.length > 0) return parts;
  }

  // Fallback: hard split by MAX_CHUNK_CHARS
  let offset = 0;
  while (offset < para.length) {
    parts.push(para.slice(offset, offset + MAX_CHUNK_CHARS));
    offset += MAX_CHUNK_CHARS;
  }
  return parts;
}

// ── Main export ────────────────────────────────────────────────────────────────

/**
 * Build semantic chunk drafts from document content text.
 * Deterministic: same input always produces same output.
 * No side effects, no DB access, no API calls.
 */
export function buildSemanticChunkDrafts(
  input: BuildSemanticChunksInput
): SemanticChunkDraft[] {
  const { documentId, contentId, contentHash, isTruncated, preserveSourceText } = input;

  const normalized = preserveSourceText ? input.contentText.trim() : normalizeText(input.contentText);

  if (normalized.length === 0) return [];

  const sourceKind: SemanticChunkDraft["sourceKind"] = isTruncated
    ? "truncated_content"
    : "document_content";

  const draft = (chunkText: string, chunkIndex: number, kind: SemanticChunkDraft["sourceKind"] = sourceKind): SemanticChunkDraft => ({
    documentId,
    contentId,
    chunkIndex,
    chunkText,
    chunkHash: sha256(chunkText),
    contentHash,
    sourceKind: kind,
    tokenEstimate: Math.ceil(chunkText.length / 4),
    charCount: chunkText.length,
  });

  // ── Short document: single chunk ────────────────────────────────────────────
  if (normalized.length < SHORT_DOCUMENT_THRESHOLD) {
    return [draft(normalized, 0, "short_document")];
  }
  if (preserveSourceText) {
    return buildSourceSlices(normalized).map((chunk, index) => draft(chunk, index));
  }

  // ── Paragraph-aware sliding window ─────────────────────────────────────────
  const paragraphs = splitIntoParagraphs(normalized);

  // Flatten paragraphs into atomic units (each <= MAX_CHUNK_CHARS)
  const units: string[] = [];
  for (const para of paragraphs) {
    const parts = splitOversizedParagraph(para);
    units.push(...parts);
  }

  const chunks: string[] = [];
  let currentChunk = "";
  let currentLen   = 0;

  for (const unit of units) {
    const unitLen = unit.length;
    const sep = currentLen > 0 ? "\n\n" : "";
    const combined = currentChunk + sep + unit;

    if (currentLen === 0) {
      // Start a new chunk
      currentChunk = unit;
      currentLen   = unitLen;
    } else if (currentLen + sep.length + unitLen <= TARGET_CHUNK_CHARS) {
      // Fits within target — append
      currentChunk = combined;
      currentLen   = combined.length;
    } else {
      // Current chunk is full — emit and start next with overlap
      if (currentChunk.trim().length >= MIN_CHUNK_CHARS) {
        chunks.push(currentChunk.trim());
      }
      // Carry overlap from end of current chunk
      const overlap = currentChunk.length > OVERLAP_CHARS
        ? currentChunk.slice(-OVERLAP_CHARS)
        : currentChunk;
      currentChunk = overlap + "\n\n" + unit;
      currentLen   = currentChunk.length;
    }
  }

  // Push final chunk
  if (currentChunk.trim().length >= MIN_CHUNK_CHARS) {
    chunks.push(currentChunk.trim());
  }

  // Enforce max chunks cap
  const cappedChunks = chunks.slice(0, MAX_CHUNKS_PER_DOCUMENT);

  return cappedChunks.map((chunk, index) => draft(chunk, index));
}
