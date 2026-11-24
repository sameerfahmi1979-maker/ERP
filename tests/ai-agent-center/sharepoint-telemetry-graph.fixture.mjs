import { once } from "node:events";

const base = "https://graph.microsoft.com/v1.0/drives/FixtureDrive";
const scenario = process.env.TELEMETRY_FIXTURE_SCENARIO;
let page = 0;
const respond = data => Response.json(data);
globalThis.fetch = async (input) => {
  const url = new URL(input);
  if (url.host === "login.microsoftonline.com") {
    return respond({ access_token: "fixture", token_type: "Bearer", expires_in: 900 });
  }
  if (url.origin !== "https://graph.microsoft.com") throw new Error("Only synthetic Graph calls are expected");
  if (url.pathname.endsWith("/items/FixtureSource")) {
    return respond({ id: "FixtureSource", folder: {}, parentReference: { driveId: "FixtureDrive" } });
  }
  if (url.pathname.endsWith("/items/FixtureIndex")) {
    return respond({ id: "FixtureIndex", folder: {}, name: "_AgentIndex", parentReference: { driveId: "FixtureDrive", id: "FixtureSource" } });
  }
  if (url.pathname.endsWith("/items/a")) {
    return respond({ id: "a", name: "a.pdf", cTag: "v2-new", size: 1024, file: { mimeType: "application/pdf" },
      parentReference: { driveId: "FixtureDrive", id: "FixtureSource" } });
  }
  if (!url.pathname.endsWith("/root/delta")) throw new Error("Unexpected Graph endpoint");
  if (scenario === "failed") return new Response(null, { status: 503 });
  if (scenario === "wait") {
    const resumed = once(process.stdin, "data");
    console.log(JSON.stringify({ event: "fixture_graph_waiting" }));
    await resumed;
    process.stdin.pause();
  }
  if (scenario === "partial") {
    ++page;
    return respond({ value: [], "@odata.nextLink": `${base}/root/delta?token=partial-${page}` });
  }
  return respond({ value: scenario === "replace" ? [{ id: "a" }] : [], "@odata.deltaLink": `${base}/root/delta?token=fixture` });
};
