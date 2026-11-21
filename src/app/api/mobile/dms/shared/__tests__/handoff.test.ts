import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import nextConfig from "../../../../../../../next.config";
import { GET } from "@/app/api/mobile/dms/shared/route";

const path = "/api/mobile/dms/shared";
const token = "A".repeat(43);

async function handoff() {
  const response = GET();
  const html = await response.text();
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  expect(scripts).toHaveLength(1);
  return { response, html, script: scripts[0][1] };
}

describe("public Android handoff", () => {
  it("enforces the hash of the actual inline script after the global Next header", async () => {
    const { response, script } = await handoff();
    const hash = createHash("sha256").update(script).digest("base64");
    const expected = `default-src 'none'; connect-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; script-src 'sha256-${hash}'`;
    const rules = await nextConfig.headers!();
    const global = rules.findIndex(rule => rule.source === "/:path*");
    const local = rules.findIndex(rule => rule.source === path);
    expect(global).toBeGreaterThanOrEqual(0);
    expect(local).toBeGreaterThan(global);
    expect(rules[local].headers).toContainEqual({key:"Content-Security-Policy",value:expected});
    expect(response.headers.get("Content-Security-Policy")).toBe(expected);
  });

  it.each([
    ["canonical fragment", "#" + token, "", true],
    ["valid fragment with query", "#" + token, "?probe=synthetic", false],
    ["query alone", "", "?share=" + token, false],
    ["invalid final character", "#" + token.slice(0, -1) + "B", "", false],
    ["incorrect length", "#" + token + "A", "", false],
    ["no fragment", "", "", false],
  ] as const)("retains the no-data handoff for %s", async (_label, hash, search, visible) => {
    const { html, script } = await handoff();
    expect(html).toContain('<a id="open" hidden>');
    const link: {hidden:boolean; href?:string} = {hidden:true};
    runInNewContext(script, {window:{location:{hash,search}},document:{getElementById:()=>link}});
    expect(link.hidden).toBe(!visible);
    expect(link.href).toBe(visible ? "algt-erp://dms/share/" + token : undefined);
  });
});
