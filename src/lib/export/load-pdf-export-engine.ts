export async function loadPdfExportEngine() {
  const [{ default: jsPDF }, { default: autoTable }, { installJsPdfShaper }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
    import("bidi-shaper/jspdf"),
  ]);
  // Registration is idempotent on the shared engine API.
  installJsPdfShaper(jsPDF.API as Parameters<typeof installJsPdfShaper>[0]);
  return { jsPDF, autoTable };
}
