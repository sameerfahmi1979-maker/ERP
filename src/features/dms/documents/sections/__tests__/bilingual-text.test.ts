import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { DmsBilingualText, textLanguage } from "../dms-bilingual-text";
it("isolates Arabic and English lines with automatic direction and language",()=>{
  const html=renderToStaticMarkup(createElement(DmsBilingualText,{text:"Company TEST-6101\nالشركة العربية 125.50\n2026 CN-123\n",label:"Extracted document text"}));
  expect(html).toContain('role="region"');expect(html).toContain('tabindex="0"');expect(html).toContain('dir="auto" lang="en"');
  expect(html).toContain('dir="auto" lang="ar"');expect(html).toContain("unicode-bidi:plaintext");expect(html).toContain("الشركة العربية 125.50");
  expect(html).not.toContain("textarea");expect(html).not.toContain("font-mono");
});
it("never treats extracted HTML or scripts as rich HTML",()=>{
  const html=renderToStaticMarkup(createElement(DmsBilingualText,{text:'<script>alert(1)</script>\n<img src=x onerror=alert(2)>',label:"Text"}));
  expect(html).not.toContain("<script>");expect(html).not.toContain("<img");expect(html).toContain("&lt;script&gt;");
});
it("recognizes the first strong letter without reversing numbers or source text",()=>{
  expect(textLanguage("2026: العربية ABC")).toBe("ar");expect(textLanguage("CN-123 العربية")).toBe("en");expect(textLanguage("125.50")).toBe("en");
});
