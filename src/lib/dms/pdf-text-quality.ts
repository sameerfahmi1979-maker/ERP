/** Embedded glyph mappings can produce plausible but wrong Arabic code points.
 * Do not try to repair/reverse those words heuristically: verify page images.
 * English-only clean PDFs keep the inexpensive local extraction path.
 */
export function pdfTextNeedsVisualOcr(text: string): boolean {
  return /\p{Script=Arabic}|\uFFFD|[\uE000-\uF8FF]|[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(text);
}
