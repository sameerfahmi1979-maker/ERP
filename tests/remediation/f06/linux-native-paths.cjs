'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const crypto = require('node:crypto');
const ts = require('typescript');
const sharp = require('sharp');
const XLSX = require('xlsx');
const JSZip = require('jszip');
const { jsPDF } = require('jspdf');

const root = process.cwd();
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'verification/source-manifest.json')));
const allowed = new Set([
  'src/server/branding-image.ts', 'src/lib/branding/constants.ts',
  'src/lib/dms/file-content-extractor.ts', 'src/lib/dms/pdf-to-images.ts', 'src/lib/logger.ts'
]);
for (const file of allowed) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex'), manifest.files[file], `unchanged app source ${file}`);
const originalResolve = Module._resolveFilename;
const originalTs = Module._extensions['.ts'];
// Match Next16.3.8's actual server compiler alias, not a mocked marker or a
// new application dependency. Next documents server-only installation optional.
assert.ok(process.execArgv.includes('--conditions=react-server'));
assert.equal(require('next/package.json').version,'16.3.8');
assert.equal(JSON.parse(fs.readFileSync('package-lock.json')).packages['node_modules/next'].version,'16.3.8');
assert.equal(crypto.createHash('sha256').update(fs.readFileSync(require.resolve('next/dist/compiled/server-only/package.json'))).digest('hex'),'e4b0cc01e2e0349c51c694fa97d8a642eb8322521ca1444b20bd1842594b4339');
const serverOnlyPackage=require('next/dist/compiled/server-only/package.json');
assert.equal(serverOnlyPackage.name,'server-only');
assert.equal(serverOnlyPackage.exports['.']['react-server'],'./empty.js');
const serverOnlyAlias=require.resolve('next/dist/compiled/server-only/empty');
assert.equal(fs.readFileSync(serverOnlyAlias).length,0);
// Execute unchanged server code in CommonJS with TypeScript's Node16 emission.
// This retains dynamic import() for ESM pdfjs, and removes only TypeScript syntax.
Module._resolveFilename = function(request, parent, ...rest) {
  if (request === 'server-only') {
    assert.equal(parent.filename,path.join(root,'src/server/branding-image.ts'));
    request = serverOnlyAlias;
  }
  if (request.startsWith('@/')) request = path.join(root, 'src', request.slice(2));
  return originalResolve.call(this, request, parent, ...rest);
};
Module._extensions['.ts'] = function(module, filename) {
  const relative = path.relative(root, filename).split(path.sep).join('/');
  assert.ok(allowed.has(relative), `unexpected application source import: ${relative}`);
  const result = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.Node16, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  });
  module._compile(result.outputText, filename);
};
let verifyBrandingImage, extractFileContent;
try {
  ({ verifyBrandingImage } = require(path.join(root, 'src/server/branding-image.ts')));
  ({ extractFileContent } = require(path.join(root, 'src/lib/dms/file-content-extractor.ts')));
} finally {
  Module._resolveFilename = originalResolve;
  if (originalTs) Module._extensions['.ts'] = originalTs;
  else delete Module._extensions['.ts'];
}
const marker = 'F06 synthetic Linux document verification content';
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

test('actual pinned Linux/glibc native packages load from this installation', () => {
  assert.equal(process.version, 'v22.23.2');
  assert.equal(process.platform, 'linux');
  assert.equal(process.arch, 'x64');
  assert.ok(process.report.getReport().header.glibcVersionRuntime);
  const locked = JSON.parse(fs.readFileSync('package-lock.json')).packages;
  for (const [name, expected] of [
    ['@next/swc-linux-x64-gnu', '16.3.8'], ['@napi-rs/canvas-linux-x64-gnu', '1.0.0'],
    ['@img/sharp-linux-x64', '0.35.5'], ['@img/sharp-libvips-linux-x64', '1.3.4'],
    ['@unrs/resolver-binding-linux-x64-gnu', '1.12.2']
  ]) {
    const file = path.join(root, 'node_modules', name, 'package.json');
    assert.equal(JSON.parse(fs.readFileSync(file)).version, expected);
    assert.equal(locked['node_modules/' + name].version, expected);
  }
  require('@next/swc-linux-x64-gnu');
  require('@unrs/resolver-binding-linux-x64-gnu');
  require('@napi-rs/canvas');
  assert.ok(sharp.versions.vips);
});

for (const format of ['png', 'jpeg', 'webp']) {
  test(`actual branding ${format} normalization produces deterministic decoded PNG`, { timeout: 15000 }, async () => {
    const input = await sharp({ create: { width: 8, height: 6, channels: 4, background: { r: 120, g: 30, b: 10, alpha: 1 } } }).toFormat(format).toBuffer();
    const file = new File([input], 'synthetic.' + format, { type: 'image/' + format });
    const first = await verifyBrandingImage(file);
    const second = await verifyBrandingImage(file);
    assert.ok(first.bytes.subarray(0, 8).equals(pngSignature));
    assert.ok(first.bytes.equals(second.bytes));
    assert.equal(first.metadata.sha256, crypto.createHash('sha256').update(first.bytes).digest('hex'));
    const decoded = await sharp(first.bytes).metadata();
    assert.equal(decoded.width, 8); assert.equal(decoded.height, 6);
  });
}
test('actual branding validator rejects active/disguised and truncated files', async () => {
  for (const data of ['<svg><script>bad()</script></svg>', '<html>synthetic</html>', pngSignature]) {
    await assert.rejects(() => verifyBrandingImage(new File([data], 'synthetic.png', { type: 'image/png' })));
  }
});
test('actual DMS TIFF path produces a decoded PNG', { timeout: 15000 }, async () => {
  const tiff = await sharp({ create: { width: 8, height: 6, channels: 3, background: 'white' } }).tiff().toBuffer();
  const result = await extractFileContent(tiff, 'image/tiff', 'synthetic.tiff');
  assert.equal(result.method, 'tiff-converted-png'); assert.equal(result.hasContent, true);
  assert.equal(result.images.length, 1); assert.equal(result.images[0].mimeType, 'image/png');
  const bytes = Buffer.from(result.images[0].base64, 'base64');
  assert.ok(bytes.subarray(0, 8).equals(pngSignature));
  assert.equal((await sharp(bytes).metadata()).width, 8);
});
test('actual DOCX extraction returns the synthetic text', { timeout: 15000 }, async () => {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${marker}</w:t></w:r></w:p></w:body></w:document>`);
  const bytes = await zip.generateAsync({ type: 'nodebuffer' });
  const result = await extractFileContent(bytes, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'synthetic.docx');
  assert.equal(result.method, 'docx-text'); assert.equal(result.hasContent, true); assert.ok(result.text.includes(marker));
});
for (const bookType of ['xlsx', 'biff8']) {
  test(`actual ${bookType} extraction preserves synthetic cells`, { timeout: 15000 }, async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([[marker, 123]]), 'Synthetic');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType });
    const result = await extractFileContent(buffer, bookType === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/vnd.ms-excel', 'synthetic.' + (bookType === 'xlsx' ? 'xlsx' : 'xls'));
    assert.equal(result.method, 'excel-text'); assert.equal(result.hasContent, true); assert.ok(result.text.includes(marker)); assert.ok(result.text.includes('123'));
  });
}
test('actual digital PDF text path returns positive content', { timeout: 20000 }, async () => {
  const pdf = new jsPDF({ compress: false });
  pdf.text(marker, 10, 20);
  const result = await extractFileContent(Buffer.from(pdf.output('arraybuffer')), 'application/pdf', 'synthetic-text.pdf');
  assert.equal(result.method, 'pdf-text-layer'); assert.equal(result.hasContent, true); assert.ok(result.text.includes(marker));
});
test('actual scanned PDF path renders a page through Linux canvas and worker', { timeout: 30000 }, async () => {
  const { createCanvas } = require('@napi-rs/canvas');
  const canvas = createCanvas(20, 20); const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff'; context.fillRect(0, 0, 20, 20);
  context.fillStyle = '#000000'; context.fillRect(2, 2, 10, 10);
  const pdf = new jsPDF({ unit: 'mm', format: [50, 50], compress: false });
  pdf.addImage(canvas.toBuffer('image/png'), 'PNG', 5, 5, 40, 40);
  const result = await extractFileContent(Buffer.from(pdf.output('arraybuffer')), 'application/pdf', 'synthetic-scanned.pdf');
  assert.equal(result.method, 'pdf-rendered-images'); assert.equal(result.hasContent, true); assert.equal(result.images.length, 1);
  const bytes = Buffer.from(result.images[0].base64, 'base64');
  assert.ok(bytes.subarray(0, 8).equals(pngSignature));
  const metadata = await sharp(bytes).metadata(); assert.ok(metadata.width > 0 && metadata.height > 0);
});
