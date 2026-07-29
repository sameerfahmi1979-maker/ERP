/**
 * ISOLATED COMPLETION SPIKE — pdfme visual Designer hands-on test.
 * CR80 employee ID card (85.6 x 54 mm), 2 faces, fixture data only.
 */
import { Designer } from "@pdfme/ui";
import { generate } from "@pdfme/generator";
import { text, image, barcodes, line, rectangle } from "@pdfme/schemas";

const plugins = { Text: text, Image: image, QR: barcodes.qrcode, Line: line, Rectangle: rectangle };

const CR80 = { width: 85.6, height: 54, padding: [0, 0, 0, 0] };

// 1x1 px placeholder PNGs (blue + white) as data URIs — no external assets.
const BLUE_PX = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkqPhfDwADygGVfV3hSgAAAABJRU5ErkJggg==";

const template = {
  basePdf: CR80,
  schemas: [
    [
      { name: "bg", type: "rectangle", position: { x: 0, y: 0 }, width: 85.6, height: 54, color: "#1e3a8a", readOnly: true },
      { name: "companyName", type: "text", position: { x: 5, y: 4 }, width: 50, height: 6, fontSize: 8, fontColor: "#ffffff", content: "Falcon Gulf Logistics L.L.C (FIXTURE)" },
      { name: "photo", type: "image", position: { x: 5, y: 13 }, width: 20, height: 26, content: BLUE_PX },
      { name: "empName", type: "text", position: { x: 28, y: 14 }, width: 38, height: 10, fontSize: 10, fontColor: "#ffffff", content: "Jonathan M. Featherstone-Harrington III" },
      { name: "designation", type: "text", position: { x: 28, y: 26 }, width: 38, height: 8, fontSize: 7, fontColor: "#dbeafe", content: "Senior Regional Logistics Coordination Specialist" },
      { name: "empCode", type: "text", position: { x: 5, y: 45 }, width: 30, height: 6, fontSize: 8, fontColor: "#ffffff", content: "FIX-EMP-001" },
      { name: "qr", type: "qrcode", position: { x: 64, y: 30 }, width: 18, height: 18, content: "https://spike.invalid/verify/DESIGNER-TEST" },
    ],
    [
      { name: "backTitle", type: "text", position: { x: 5, y: 5 }, width: 75, height: 6, fontSize: 8, content: "This card is the property of the company (FIXTURE)." },
      { name: "policyText", type: "text", position: { x: 5, y: 14 }, width: 75, height: 24, fontSize: 6, content: "If found, please return to Falcon Gulf Logistics L.L.C, Plot 12, Industrial Area 9, Sharjah, UAE. This synthetic card is generated from spike fixtures only." },
      { name: "serial", type: "text", position: { x: 5, y: 44 }, width: 40, height: 6, fontSize: 7, content: "SERIAL: FIX-CARD-0001" },
    ],
  ],
};

const domContainer = document.getElementById("designer");
const designer = new Designer({ domContainer, template, plugins });
window.__designer = designer;

// Expose an Arabic generation helper so the spike can capture PDF bytes for
// inspection of the known RTL/shaping limitation (returns base64).
window.__generateArabic = async () => {
  const t = designer.getTemplate();
  const arName = t.schemas[0].find((s) => s.name === "empName");
  if (arName) arName.content = "عبدالرحمن خالد المنصوري";
  const arDesig = t.schemas[0].find((s) => s.name === "designation");
  if (arDesig) arDesig.content = "مشرف عمليات النقل والخدمات اللوجستية";
  const inputs = [{
    companyName: "Falcon Gulf Logistics L.L.C (FIXTURE)",
    photo: BLUE_PX,
    empName: "عبدالرحمن خالد المنصوري",
    designation: "مشرف عمليات النقل والخدمات اللوجستية",
    empCode: "FIX-EMP-AR-001",
    qr: "https://spike.invalid/verify/DESIGNER-TEST",
    backTitle: "هذه البطاقة ملك للشركة (تجريبي).",
    policyText: "في حال العثور عليها يرجى إعادتها إلى المقر الرئيسي.",
    serial: "SERIAL: FIX-CARD-AR-0001",
  }];
  const pdf = await generate({ template: t, inputs, plugins });
  let bin = "";
  const bytes = new Uint8Array(pdf.buffer);
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
};

const status = (t) => (document.getElementById("status").textContent = t);
status("READY");
performance.mark("designer-ready");

document.getElementById("btn-export").onclick = () => {
  const t = designer.getTemplate();
  localStorage.setItem("spike-pdfme-template", JSON.stringify(t));
  status(`EXPORTED ${JSON.stringify(t).length} bytes to localStorage`);
};

document.getElementById("btn-reload").onclick = () => {
  const saved = localStorage.getItem("spike-pdfme-template");
  if (!saved) return status("NOTHING SAVED");
  designer.updateTemplate(JSON.parse(saved));
  status("REOPENED saved template");
};

let company = "A";
document.getElementById("btn-company").onclick = () => {
  company = company === "A" ? "B" : "A";
  const t = designer.getTemplate();
  const name = t.schemas[0].find((s) => s.name === "companyName");
  const bg = t.schemas[0].find((s) => s.name === "bg");
  if (company === "B") {
    name.content = "Desert Falcon Contracting W.L.L (FIXTURE)";
    bg.color = "#14532d";
  } else {
    name.content = "Falcon Gulf Logistics L.L.C (FIXTURE)";
    bg.color = "#1e3a8a";
  }
  designer.updateTemplate(t);
  status(`COMPANY ${company} branding applied`);
};

document.getElementById("btn-generate").onclick = async () => {
  status("generating…");
  const t0 = performance.now();
  const t = designer.getTemplate();
  const inputs = [{
    companyName: company === "A" ? "Falcon Gulf Logistics L.L.C (FIXTURE)" : "Desert Falcon Contracting W.L.L (FIXTURE)",
    photo: BLUE_PX,
    empName: "Jonathan M. Featherstone-Harrington III",
    designation: "Senior Regional Logistics Coordination Specialist",
    empCode: "FIX-EMP-001",
    qr: "https://spike.invalid/verify/DESIGNER-TEST",
    backTitle: "This card is the property of the company (FIXTURE).",
    policyText: "If found, please return to Falcon Gulf Logistics L.L.C, Plot 12, Industrial Area 9, Sharjah, UAE.",
    serial: "SERIAL: FIX-CARD-0001",
  }];
  try {
    const pdf = await generate({ template: t, inputs, plugins });
    const ms = Math.round(performance.now() - t0);
    const blob = new Blob([pdf.buffer], { type: "application/pdf" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `designer-card-company-${company}.pdf`;
    a.click();
    status(`GENERATED in ${ms} ms (${pdf.length} bytes), company ${company}`);
    window.__lastGenerateMs = ms;
  } catch (e) {
    status("GENERATE FAILED: " + e.message);
  }
};
