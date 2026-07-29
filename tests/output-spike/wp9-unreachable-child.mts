/** Child probe: GOTENBERG_URL is pointed at a dead port by the parent. */
process.env.GOTENBERG_URL = "http://127.0.0.1:39999";
const { renderOfficialHtmlToPdf } = await import("../../src/lib/output/html-adapter.ts");
try {
  await renderOfficialHtmlToPdf({ html: "<html><body>probe</body></html>" });
  console.log("UNEXPECTED_SUCCESS");
  process.exit(2);
} catch (err) {
  const e = err as Error & { retryable?: boolean };
  console.log(`THREW retryable=${e.retryable} message=${e.message.slice(0, 80)}`);
  process.exit(e.retryable === true ? 0 : 3);
}
