/**
 * OUTPUT.4 — Quick Print draft watermark (pure).
 *
 * v6.1: Quick Print output must be visibly watermarked so it can never be
 * confused with an officially issued PDF. `position: fixed` repeats the
 * watermark on every printed page in Chromium-based print pipelines.
 */

const WATERMARK_MARKUP = `
<div aria-hidden="true" style="position: fixed; inset: 0; z-index: 2147483647; pointer-events: none; display: flex; align-items: center; justify-content: center; overflow: hidden;">
  <span style="transform: rotate(-30deg); font-family: Arial, sans-serif; font-size: 54px; font-weight: 800; letter-spacing: 5px; color: rgba(220, 38, 38, 0.16); white-space: nowrap; text-transform: uppercase;">Draft — Not Officially Issued</span>
</div>
`;

/** Inject the draft watermark overlay into a full HTML document string. */
export function injectDraftWatermark(html: string): string {
  if (html.includes("</body>")) {
    return html.replace("</body>", `${WATERMARK_MARKUP}</body>`);
  }
  return html + WATERMARK_MARKUP;
}