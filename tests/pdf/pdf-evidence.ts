import { createHash } from 'node:crypto';
/** Parse downloaded bytes: a toast, filename or PDF prefix alone cannot pass. */
export async function inspectPdf(buffer: Buffer, expectedText: string[], expectedPages?: number, expectedSize?: { width: number; height: number }) {
  if (buffer.subarray(0, 5).toString('ascii') !== '%PDF-' || buffer.length < 500) throw new Error('FAIL: response is not a non-empty PDF.');
  if (!expectedText.length || expectedText.some(text => !text.trim())) throw new Error('BLOCKED: PDF content oracle is empty.');
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loading = getDocument({ data: new Uint8Array(buffer), useSystemFonts: true });
  try {
    const document = await loading.promise;
    if (document.numPages < 1 || (expectedPages !== undefined && document.numPages !== expectedPages)) throw new Error('FAIL: unexpected PDF page count.');
    const pages: string[] = [];
    for (let n = 1; n <= document.numPages; n++) {
      const page = await document.getPage(n), content = await page.getTextContent();
      const size = page.getViewport({ scale: 1 });
      if (expectedSize && (Math.abs(size.width - expectedSize.width) > 2 || Math.abs(size.height - expectedSize.height) > 2)) throw new Error('FAIL: unexpected PDF page dimensions.');
      const text = content.items.map(item => 'str' in item ? item.str : '').join(' ').replace(/\s+/g, ' ').trim();
      if (!text) throw new Error('FAIL: PDF contains a blank or unextractable page.');
      pages.push(text);
    }
    const text = pages.join(' ');
    if (expectedText.some(expected => !text.includes(expected.replace(/\s+/g, ' ').trim()))) throw new Error('FAIL: PDF does not contain the expected synthetic record/content.');
    if (/Application error|Internal Server Error|Missing print token|Invalid or expired print token/.test(text)) throw new Error('FAIL: PDF contains an application error.');
    return { pages: document.numPages, bytes: buffer.length, sha256: createHash('sha256').update(buffer).digest('hex') };
  } finally { await loading.destroy(); }
}
