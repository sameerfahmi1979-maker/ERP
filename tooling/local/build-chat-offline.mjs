import { build } from "vite";
import { fileURLToPath } from "node:url";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const root = fileURLToPath(new URL("../../", import.meta.url));
const result = await build({
  root,
  configFile: false,
  publicDir: false,
  logLevel: "warn",
  build: {
    write: false,
    target: "es2022",
    minify: true,
    lib: {
      entry: path.join(root, "src/features/messages/offline-entry.ts"),
      formats: ["es"],
      fileName: "messages-offline",
    },
    rolldownOptions: { output: { codeSplitting: false } },
  },
});
const chunks = (Array.isArray(result) ? result : [result])
  .flatMap((r) => r.output)
  .filter((o) => o.type === "chunk");
if (chunks.length !== 1) throw Error("Offline Messages must produce a single public module.");
const target = path.join(root, "public/messages-offline.mjs"),
  code = chunks[0].code;
const assets = await Promise.all(
  ["messages-offline.html", "messages-offline.css"].map((f) => readFile(path.join(root, "public", f))),
);
const hash = createHash("sha256").update(code);
for (const a of assets) hash.update(a);
const key = hash.digest("hex").slice(0, 20);
const worker = path.join(root, "public/messages-offline-worker.js"),
  source = await readFile(worker, "utf8");
const digests = Object.fromEntries(
  ["/messages-offline.html", "/messages-offline.css", "/messages-offline.mjs"].map((f, i) => [
    f,
    createHash("sha256")
      .update(i === 2 ? code : assets[i])
      .digest("hex"),
  ]),
);
const updated = source
  .replace(/algt-chat-offline-shell-(?:v1|[0-9a-f]{20})(?=")/, "algt-chat-offline-shell-" + key)
  .replace(
    /const EXPECTED = .*?; \/\/ Generated digests of public assets/,
    "const EXPECTED = " + JSON.stringify(digests) + "; // Generated digests of public assets",
  );
if (process.argv.includes("--check")) {
  if ((await readFile(target, "utf8")) !== code || updated !== source)
    throw Error("The offline Messages bundle must be rebuilt.");
} else {
  await writeFile(target, code);
  await writeFile(worker, updated);
}
