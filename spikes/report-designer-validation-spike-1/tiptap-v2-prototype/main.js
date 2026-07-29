/**
 * SPIKE — Candidate A probe: TipTap v2 + community pagination extension.
 * Tests: visual A4 page boundaries, page breaks across long content,
 * Arabic RTL paragraphs, table behaviour at page boundaries.
 */
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Pagination, { PageNode, HeaderFooterNode, BodyNode } from "tiptap-extension-pagination";

const longPara =
  "Paragraph fixture. This paragraph exists to force multi-page flow and inspect page-boundary behaviour, widow/orphan handling and paragraph splitting quality in the community pagination extension. The quick brown fox jumps over the lazy dog while the logistics coordinator reviews the consolidated manifest. ".repeat(3);

const arabicPara =
  "تشهد إدارة الموارد البشرية في الشركة بأن الموظف المذكور أعلاه يعمل لدينا بدوام كامل، وقد أظهر خلال فترة عمله التزاماً مهنياً عالياً وكفاءة متميزة في أداء المهام الموكلة إليه.";

const paragraphs = [];
paragraphs.push("<h1>EMPLOYMENT CERTIFICATE — SPIKE FIXTURE</h1>");
paragraphs.push("<p><strong>Ref:</strong> FIX/TIPTAP/2026/0001 — <strong>Employee:</strong> FIX-EMP-001</p>");
for (let i = 1; i <= 14; i++) {
  if (i % 5 === 0) paragraphs.push(`<h2>Section ${i / 5} — heading near potential page boundary</h2>`);
  paragraphs.push(`<p>${i}. ${longPara}</p>`);
  if (i === 7) paragraphs.push(`<p class="rtl-block" dir="rtl">${arabicPara}</p>`);
}

try {
  const editor = new Editor({
    element: document.querySelector("#editor"),
    extensions: [
      StarterKit,
      Pagination.configure({
        defaultPaperSize: "A4",
        defaultPaperColour: "#ffffff",
        defaultMarginConfig: { top: 25, right: 25, bottom: 25, left: 25 },
        pageAmendmentOptions: { enableHeader: true, enableFooter: true },
      }),
      PageNode,
      HeaderFooterNode,
      BodyNode,
    ],
    content: paragraphs.join("\n"),
  });
  window.__spikeEditor = editor;
  document.querySelector("#status").textContent =
    " — editor READY, pages rendered: " + document.querySelectorAll(".page, [data-page]").length;
  setTimeout(() => {
    document.querySelector("#status").textContent =
      " — editor READY, page nodes after layout: " +
      (document.querySelectorAll("[data-page], .page").length || document.querySelectorAll(".ProseMirror > *").length + " top-level nodes (no page nodes found)");
  }, 1500);
} catch (err) {
  document.querySelector("#status").textContent = " — INIT FAILED: " + err.message;
  console.error(err);
}
