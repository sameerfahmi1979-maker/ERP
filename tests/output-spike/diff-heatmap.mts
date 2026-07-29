/** Generates a red-overlay diff heatmap for the CMP_D1 pair to localize differences. */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const CMP = "implementation_Review/PDF/output_spike_1_evidence/compare";
const DPI = 96;
const MARGIN_X = Math.round(0.7 * DPI);
const MARGIN_TOP = Math.round(0.6 * DPI);
const PAGE_W = Math.round(8.27 * DPI);
const CONTENT_W = PAGE_W - MARGIN_X * 2;

for (const id of ["CMP_D1_english_cert", "CMP_D4_arabic_cert"]) {
  const pdfBytes = readFileSync(join(CMP, `${id}_page-1.png`));
  const meta = await sharp(pdfBytes).metadata();
  const scale = (meta.width ?? PAGE_W) / PAGE_W;
  const cropX = Math.round(MARGIN_X * scale);
  const cropY = Math.round(MARGIN_TOP * scale);
  const cropW = Math.min(Math.round(CONTENT_W * scale), (meta.width ?? PAGE_W) - cropX);
  const cropH = (meta.height ?? 0) - cropY * 2;

  const pdfExtracted = await sharp(pdfBytes).extract({ left: cropX, top: cropY, width: cropW, height: cropH }).png().toBuffer();
  const pdfTrim = await sharp(pdfExtracted).trim({ threshold: 12 }).png().toBuffer();
  const pdfInfo = await sharp(pdfTrim).metadata();

  const prevTrim = await sharp(readFileSync(join(CMP, `${id}_preview.png`)))
    .trim({ threshold: 12 })
    .resize(pdfInfo.width, pdfInfo.height, { fit: "fill" })
    .png()
    .toBuffer();

  const a = await sharp(pdfTrim).grayscale().raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(prevTrim).grayscale().raw().toBuffer({ resolveWithObject: true });

  const w = a.info.width;
  const h = a.info.height;
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const base = a.data[i];
    const d = Math.abs(a.data[i] - (b.data[i] ?? 255));
    rgba[i * 4] = d > 32 ? 255 : base;
    rgba[i * 4 + 1] = d > 32 ? 0 : base;
    rgba[i * 4 + 2] = d > 32 ? 0 : base;
    rgba[i * 4 + 3] = 255;
  }
  await sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).png().toFile(join(CMP, `${id}_diff_heatmap.png`));
  console.log(`${id}: heatmap ${w}x${h} written`);
}
