import { afterEach, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { jsPDF } from "jspdf";
import { getDmsAiProvider } from "../factory";
import { routeOcr } from "@/lib/dms/ocr/ocr-router";
const require = createRequire(import.meta.url);
afterEach(() => vi.unstubAllEnvs());
it.skipIf(process.env.OCR_RUN_LIVE !== "1")("transcribes a synthetic bilingual image using gpt-6.1-sol and the existing Railway key", async () => {
  const { railwayEnvironment } = require("../../../../../tooling/ocr-openai/railway-environment.cjs");
  const vars = railwayEnvironment();
  if (!vars.OPENAI_API_KEY) throw new Error("Railway OpenAI key is missing");
  vi.stubEnv("OPENAI_API_KEY", vars.OPENAI_API_KEY);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", vars.NEXT_PUBLIC_SUPABASE_URL);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", vars.SUPABASE_SERVICE_ROLE_KEY);
  const font = "C:/Windows/Fonts/arial.ttf";
  if (existsSync(font)) GlobalFonts.registerFromPath(font, "ALGT Synthetic");
  const canvas = createCanvas(1200, 420);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "white"; ctx.fillRect(0, 0, 1200, 420);
  ctx.fillStyle = "black"; ctx.font = '38px "ALGT Synthetic", sans-serif';
  ctx.fillText("ALGT SYNTHETIC OCR TEST 6101", 40, 85);
  ctx.fillText("Vehicle: TEST-6101   Amount: 125.50 AED", 40, 160);
  ctx.fillText("اختبار مستند تجريبي", 40, 250);
  const { provider, configId, configCode } = await getDmsAiProvider("ocr");
  if (process.env.OCR_EXPECT_CONFIG_ID) expect(configId).toBe(Number(process.env.OCR_EXPECT_CONFIG_ID));
  expect(provider.isConfigured()).toBe(true);
  expect(provider.modelId).toBe("gpt-6.1-sol");
  const azure = { providerCode: "azure_doc_intel" as const, providerName: "unused Azure",
    supportedMimeTypes: ["image/png"], isConfigured: () => true, supports: () => true, extractText: vi.fn() };
  const result = await routeOcr({ buffer: canvas.toBuffer("image/png"), mimeType: "image/png", fileName: "algt-synthetic-ocr-6101.png",
    featureFlags: { dmsOcr: true, dmsOcrRouter: true, dmsOcrAzure: false, dmsOcrGptVisionFallback: true },
    azureProvider: azure, gptProvider: provider });
  expect(result.text).toContain("TEST-6101");
  expect(result.text).toContain("125.50");
  expect(result.text).toContain("اختبار");
  expect(result.text).toContain("تجريبي");
  expect(result).toMatchObject({ providerCode: "vision", model: "gpt-6.1-sol", sourceKind: "image", fallbackUsed: false });
  expect(azure.extractText).not.toHaveBeenCalled();
  console.log(JSON.stringify({ syntheticOcrPassed: true, configId, configCode, model: result.model,
    englishRecovered: true, arabicRecovered: true, amountRecovered: true, databaseWrites: false, browserTesting: false }));
}, 180000);

it.skipIf(process.env.OCR_RUN_LIVE !== "1")("reads a synthetic bilingual PDF visually instead of trusting its Arabic text layer", async () => {
  const { railwayEnvironment } = require("../../../../../tooling/ocr-openai/railway-environment.cjs");
  const vars = railwayEnvironment();
  for (const name of ["OPENAI_API_KEY","NEXT_PUBLIC_SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY"]) vi.stubEnv(name,vars[name]);
  const {provider,configId}=await getDmsAiProvider("ocr");
  if(process.env.OCR_EXPECT_CONFIG_ID)expect(configId).toBe(Number(process.env.OCR_EXPECT_CONFIG_ID));
  const doc=new jsPDF();doc.setFontSize(18);doc.text("ALGT SYNTHETIC OCR TEST 6101",20,30);
  doc.text("Vehicle TEST-6101 Amount 125.50 AED",20,50);
  doc.addFileToVFS("Arabic.ttf",readFileSync(resolve("public/fonts/noto-sans-arabic-400.ttf")).toString("base64"));
  doc.addFont("Arabic.ttf","Arabic","normal");doc.setFont("Arabic");doc.text("اختبار مستند تجريبي",20,75);
  const result=await routeOcr({buffer:Buffer.from(doc.output("arraybuffer")),mimeType:"application/pdf",fileName:"synthetic-bilingual.pdf",
    featureFlags:{dmsOcr:true,dmsOcrRouter:true,dmsOcrAzure:false,dmsOcrGptVisionFallback:true},azureProvider:null,gptProvider:provider});
  expect(result).toMatchObject({providerCode:"vision",model:"gpt-6.1-sol",sourceKind:"digital"});
  for(const word of ["TEST-6101","125.50","اختبار","تجريبي"])expect(result.text).toContain(word);
},180000);
