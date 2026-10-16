import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { batchFingerprint, batchManifestSchema, canonicalBatchManifest, dmsFileMetadataSchema, batchReceiptSchema, type BatchManifest, type BatchReceipt } from "../../../src/lib/dms/batch-admission";

// MAIN_NATIVE_WIRING_OPEN: scenario assertions only, NOT an executable native
// harness and NOT native acceptance. N01-N18 below remain skipped. The separate
// W38_CANONICAL_READ_ONLY tranche has an explicit gate and proves no admission.
// Main must author/review a fresh exact candidate+fixture admission and wire its
// finite admission driver in a subsequent writing turn. No URI/credential
// discovery, socket fallback, old helper import or Docker launch here.
// No synthetic GUC alone may count as a genuine current Auth session.

// W38_CANONICAL_READ_ONLY: no Auth, RPC, fixture, application table or provider
// access. This privileged local reader is NOT a caller/authorization test.
const canonicalEnabled = process.env.ALGT_F06_DMS_CANONICAL_W38 === "1";
const candidateRoot = "C:/dev/agt-erp-f06";
const runtimeRoot = `${candidateRoot}/CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F06/native77c`;
const evidenceRoot = "C:/dev/agt-erp/CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F06/W38_NATIVE77C";
const migrationPath = `${candidateRoot}/supabase/migrations/20261005083645_f06_atomic_batch_admission.sql`;
const nativePath = `${candidateRoot}/tests/remediation/f06/dms-batch-admission.local.test.ts`;
const libraryPath = `${candidateRoot}/src/lib/dms/batch-admission.ts`;
const referencePath = "C:/dev/agt-erp/CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F06/BATCH_CANONICAL_REFERENCE_DIGESTS_20261005.md";
const manifestPath = "C:/dev/agt-erp/CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F06/W28_MIGRATION_MANIFEST_20261013.json";
const manifestSha256 = "175e3c64ad822b0ffcf3c82da90dfb8219183b2b060c68a229a6e7b16d422052";
const replayPath = `${runtimeRoot}/candidate-replay-r2.json`;
const h = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const baseFile = {position: 0, original_filename: "a.pdf", mime_type: "application/pdf", file_size_bytes: 1, sha256_hash: h};
const baseManifest: BatchManifest = {version: 1, context: null, files: [baseFile]};
type Vector = {id: string; raw: string; literal: string; hash: string};
// Fixed reference-literal expansion only; never consumes production output.
const literalOne = (name: string, mime = "application/pdf", size = "1", context = "null") =>
  `["dms-batch-admission/v1",${context},[[0,"${name}","${mime}",${size},"${h}"]]]`;
const vectors: Vector[] = [];
const addVector = (id: string, manifest: unknown, literal: string, hash: string) => vectors.push({id, raw: JSON.stringify(manifest), literal, hash});
addVector("V01", baseManifest, literalOne("a.pdf"), "1b97f3098fb2e29b43e7641d17a9b6efca8ae3fd284215291a93a4f33cfdf437");
addVector("V03", {...baseManifest, files: [{...baseFile, original_filename: 'a"b\\c.PDF'}]}, literalOne('a\\"b\\\\c.PDF'), "b96fbcdfe330d28438a14e9ee1c8f8264ff0e03be2604f349137e587288d41cc");
for (const [id, name, hash] of [
  ["V04", "é-📄.pdf", "d2e231825b2311c7fe0368725bf9de7da795a01bcf83d15357c6ff162576683d"],
  ["V05", "e\u0301-📄.pdf", "72ca9b0cd89dd1075bfc61c8dab901513fbe812c4024d61ebac0ce744eb98f0d"],
]) addVector(id, {...baseManifest, context: {type: "party", id: 42}, files: [{...baseFile, original_filename: name, file_size_bytes: 52428800}]}, literalOne(name, "application/pdf", "52428800", '["party",42]'), hash);
const ordered = [{...baseFile, original_filename: "photo.JPEG", mime_type: "image/jpeg", file_size_bytes: 2}, {...baseFile, position: 1, original_filename: "scan.tif", mime_type: "image/tiff", file_size_bytes: 3}];
addVector("V06", {...baseManifest, files: ordered}, `["dms-batch-admission/v1",null,[[0,"photo.JPEG","image/jpeg",2,"${h}"],[1,"scan.tif","image/tiff",3,"${h}"]]]`, "f7998910b37522d320c150bc80b519b2332dffbe0f5c85eed30dc8681dafed2c");
addVector("V06-reversed", {...baseManifest, files: [...ordered].reverse().map((f, position) => ({...f, position}))}, `["dms-batch-admission/v1",null,[[0,"scan.tif","image/tiff",3,"${h}"],[1,"photo.JPEG","image/jpeg",2,"${h}"]]]`, "91f6f5432aa8bb0f0f44e2e83211543002420b10717be6e112322468e464d3f5");
for (const [id, first, second, hash] of [
  ["V07-duplicate-metadata-only", "same.pdf", "same.pdf", "58a2c262c4521064e3ecd1a0e80d488f3b647fd66ea1e20cba3e4b9c3abe4f22"],
  ["V07-collision-metadata-only", "a?.pdf", "a*.pdf", "03882ac58e3b1dfa946ac2f8b3e4d7aaf53792f43cc729e64e8b1659b14d5501"],
]) addVector(id, {...baseManifest, files: [first, second].map((original_filename, position) => ({...baseFile, position, original_filename}))}, `["dms-batch-admission/v1",null,[[0,"${first}","application/pdf",1,"${h}"],[1,"${second}","application/pdf",1,"${h}"]]]`, hash);
addVector("V08-name500", {...baseManifest, files: [{...baseFile, original_filename: "📄".repeat(496) + ".pdf"}]}, literalOne("📄".repeat(496) + ".pdf"), "75fd6cc418fb9656de8ebaccdfadd08dfa99c8321b98c258c7db711ced4f588e");
addVector("V08-size-max", {...baseManifest, files: [{...baseFile, file_size_bytes: 52428800}]}, literalOne("a.pdf", "application/pdf", "52428800"), "001ee08ee7ef39add33f94daab57cbd02aaeb11a6bfb96ce75a76cdf5145ba26");
addVector("V08-ten-files", {...baseManifest, files: Array.from({length: 10}, (_, position) => ({...baseFile, position}))}, `["dms-batch-admission/v1",null,[${Array.from({length: 10}, (_, i) => `[${i},"a.pdf","application/pdf",1,"${h}"]`).join(",")}]]`, "c3180c64a96d9f2e8a2357ee18df6baa987163ff0b34e2a29b82dbcf99299df7");
for (const [id, value, hash] of [
  ["V08-context-min", 1, "b810dabf31e9c01fa5468f67b660981e3eea6513e34d59eca243ac580bde7cb5"],
  ["V08-context-max", 9007199254740991, "1b013f90de2e66cb5273c3438f4270095272bc9b722fb71408137bd7cb8e6176"],
] as const) addVector(id, {...baseManifest, context: {type: "party", id: value}}, literalOne("a.pdf", "application/pdf", "1", `["party",${value}]`), hash);
for (const [scalar, hash] of [
  ["\u00a0", "c15c3217fa6dc38055b5efa65761380cbd820b156ba50abafa024c1644e4b135"],
  ["\u3000", "3e7654b4f6f5717ba6e45308385c438ad184aa96c44154ec3ecb98317094bb73"],
  ["\ufeff", "542cf2e05860966516c4ef95e7837b2cc0e84f6ac840ecd476aacb35bf282ada"],
]) addVector(`R3-embedded-${scalar.codePointAt(0)!.toString(16)}`, {...baseManifest, files: [{...baseFile, original_filename: `a${scalar}.pdf`}]}, literalOne(`a${scalar}.pdf`), hash);
const extensions = [
  ["pdf", "application/pdf", "1b97f3098fb2e29b43e7641d17a9b6efca8ae3fd284215291a93a4f33cfdf437", "a08aa44e5d7cba8ccad33c7061c05a51f71239e53110200e49cb9d2dc3290c92"],
  ["jpg", "image/jpeg", "a6d3ae3fdaa82d0891421b59563281497b1c5033cb5652e433e5ac48257377bb", "f9b6901f72fae1836b6a4d40af6b83b3a746a74cb6b6df80454b1db4eb762ec2"],
  ["jpeg", "image/jpeg", "f571f053e45a3e9b8b9a8fd4f50d0530e207eb6c559cda58d638dbb8bf29a690", "3515b3708b84034f3638c3f3a06e7eacd1bb3de4c0997d08efd19f798971d790"],
  ["png", "image/png", "2c4eed6dfeb65aa8d5dabc6814b5fa74de73f4585a4b8cf44ded1ee423bc2b1b", "67581bc6f92ff5d54c1ad6dde3aa2322f04a34263a2d4d5397cdc75b03f39d33"],
  ["tif", "image/tiff", "cbd01bca1261cb994fbe7715620817cae8eea14a60d5560e0d1448da5db1cdc9", "a380705bbde6b3e481baba3ab1512799027022a9248301fb9b7c850ecc66de37"],
  ["tiff", "image/tiff", "ed25a8cc562b86dd011ce6e3345f338a6d86433886e076b4926146f685b79c0d", "65ec450aa19737c65b62c668311dfed7866127f2b16a6641bc4f28b4f7e0b53a"],
  ["webp", "image/webp", "c008f32c4bb4ff5bdf68eb19c70136c70f339762dc2c013c439c9ecaf961b681", "7c0d60eb53324931927d1ea8dbd2888d80c402545baa2075785fc2c0b758a9a2"],
  ["doc", "application/msword", "6b1e52d0cd0088c16b632a63eded58561321a2f85f2a6abdaa533dffe10aa7f3", "4d15c6e0b09cdf859eef86e700bf14c6e747da0bda07a9afeb476a2617ddced5"],
  ["docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "f78c0ef68bc66c81172854cf00631b63ef7335475d7f5d88e7e0d0ff5d78d924", "2f210f3213a69c8704cf079bd87175a67a9267a999ac71d061c13f5f81499232"],
  ["xls", "application/vnd.ms-excel", "183ef59dd30fbab2a634a4d52bb5616b5e2669ec86ce444d2b2b5f721bcda5eb", "67ad1694febd58ac251687af63eff6982b3e98afe0faa729d408b5ba15ce818c"],
  ["xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "ebe0b572b635209cfca788183f6824523ee41bb87d5388776c3560c697873172", "0bb233c71fa52b1919615d23d2fa1a46ddbeff2ba19bed2c8a28234fef12f295"],
];
// V10 substitutions and both spelling digests are fixed in the reference report.
const hashBytes = (v: string) => createHash("sha256").update(v, "utf8").digest("hex");
for (const [extension, mime, lowerHash, upperHash] of extensions) for (const [ext, hash] of [[extension, lowerHash], [extension.toUpperCase(), upperHash]]) {
  const literal = literalOne(`a.${ext}`, mime);
  addVector(`V10-${ext}`, {...baseManifest, files: [{...baseFile, original_filename: `a.${ext}`, mime_type: mime}]}, literal, hash);
}
for (const numeric of ["1", "1.0", "1e0"]) vectors.push({id: `R3-numeric-${numeric}`, raw: `{"version":${numeric},"context":{"type":"party","id":${numeric}},"files":[{"position":-0,"original_filename":"a.pdf","mime_type":"application/pdf","file_size_bytes":${numeric},"sha256_hash":"${h}"}]}`, literal: literalOne("a.pdf", "application/pdf", "1", '["party",1]'), hash: "b810dabf31e9c01fa5468f67b660981e3eea6513e34d59eca243ac580bde7cb5"});
vectors.push({...vectors.find(v => v.id === "V08-context-max")!, id: "R3-max-scale", raw: JSON.stringify({...baseManifest, context: {type: "party", id: 9007199254740991}}).replace("9007199254740991", "9007199254740991.0")});
vectors.push({...vectors[0], id: "V11-key-order-format", raw: JSON.stringify({files: [baseFile], context: null, version: 1}, null, 2)});
type Rejection = {id: string; raw: string | null; state: "22023" | "22P02" | "22P05"; typescript: boolean};
const rejected: Rejection[] = [];
const reject = (id: string, value: unknown) => rejected.push({id, raw: JSON.stringify(value), state: "22023", typescript: true});
for (const value of [null, false, [], "object"]) reject(`manifest-${JSON.stringify(value)}`, value);
for (const key of ["version", "context", "files"] as const) {
  const missing = {...baseManifest} as Record<string, unknown>; delete missing[key]; reject(`missing-${key}`, missing);
  for (const value of [null, false, "1"]) if (!(key === "context" && value === null)) reject(`wrong-${key}-${value}`, {...baseManifest, [key]: value});
}
for (const version of [0, 1.5, 2]) reject(`version-${version}`, {...baseManifest, version});
reject("extra-manifest", {...baseManifest, extra: true});
for (const id of [0, -1, 1.5, 9007199254740992, "1", null, false]) reject(`context-id-${id}`, {...baseManifest, context: {type: "party", id}});
for (const context of [{id: 1}, {type: "party"}, {type: null, id: 1}, {type: 1, id: 1}, {type: "employee", id: 1}, {type: "party", id: 1, extra: true}]) reject(`context-${JSON.stringify(context)}`, {...baseManifest, context});
for (const count of [0, 11]) reject(`file-count-${count}`, {...baseManifest, files: Array.from({length: count}, (_, position) => ({...baseFile, position}))});
for (const key of Object.keys(baseFile)) {
  const missing = {...baseFile} as Record<string, unknown>; delete missing[key]; reject(`file-missing-${key}`, {...baseManifest, files: [missing]});
  for (const value of [null, false, {}]) reject(`file-wrong-${key}-${JSON.stringify(value)}`, {...baseManifest, files: [{...baseFile, [key]: value}]});
}
for (const position of [-1, 1, 0.5, "0"]) reject(`position-${position}`, {...baseManifest, files: [{...baseFile, position}]});
reject("duplicate-position", {...baseManifest, files: [baseFile, baseFile]});
reject("reversed-unrenumbered", {...baseManifest, files: [...ordered].reverse()});
reject("extra-file", {...baseManifest, files: [{...baseFile, extra: true}]});
for (const file_size_bytes of [0, -1, 1.5, 52428801, 9007199254740992, "1"]) reject(`size-${file_size_bytes}`, {...baseManifest, files: [{...baseFile, file_size_bytes}]});
for (const original_filename of ["", " ", "\u00a0", "\u3000", "\ufeff", "\u00a0\u3000\ufeff", "a\n.pdf", "a\u007f.pdf", "a\u009f.pdf", "📄".repeat(497) + ".pdf", "a.exe"]) reject(`name-${rejected.length}`, {...baseManifest, files: [{...baseFile, original_filename}]});
for (const mime_type of ["", "application/octet-stream", "image/png"]) reject(`mime-${mime_type}`, {...baseManifest, files: [{...baseFile, mime_type}]});
for (const sha256_hash of [h.toUpperCase(), "a".repeat(63), "a".repeat(65), "g".repeat(64)]) reject(`hash-${sha256_hash.slice(0, 2)}-${sha256_hash.length}`, {...baseManifest, files: [{...baseFile, sha256_hash}]});
for (const escaped of ["\\u0000", "\\ud800", "\\udfff"]) rejected.push({id: `jsonb-parser-${escaped}`, raw: JSON.stringify(baseManifest).replace("a.pdf", `a${escaped}.pdf`), state: escaped === "\\u0000" ? "22P05" : "22P02", typescript: true});
rejected.push({id: "SQL-NULL", raw: null, state: "22023", typescript: false});
// Parsed-boundary precision is intentional: JS may round this lexical fraction
// to an integer; only SQL's retained numeric fraction is asserted to reject.
rejected.push({id: "SQL-retained-fraction", raw: JSON.stringify({...baseManifest, context: {type: "party", id: 9007199254740991}}).replace("9007199254740991", "9007199254740991.1"), state: "22023", typescript: false});
reject("V11-overlarge-invalid-name", {...baseManifest, files: [{...baseFile, original_filename: "a".repeat(262145)}]});

describe.skipIf(!canonicalEnabled)("W38_CANONICAL_READ_ONLY — not N01-N18 or admission acceptance", () => {
  let containerId = "", started = "", databaseOid = 0, serverStarted = "", journal: number | undefined;
  let ready = false, stopped = false, passed = 0;
  let bodyActive = false, deadline = Number.POSITIVE_INFINITY;
  const pins = new Map<string, string>();
  const marker = `W38_DMS_CANONICAL_${Date.now()}`;
  const note = (event: string, detail: unknown) => {
    if (journal === undefined) throw Error("Canonical journal unavailable");
    const bytes = Buffer.from(JSON.stringify({at: new Date().toISOString(), event, detail}) + "\n");
    let offset = 0; while (offset < bytes.length) {
      const written = fs.writeSync(journal, bytes, offset);
      if (written < 1) throw Error("Canonical journal short write");
      offset += written;
    }
    fs.fsyncSync(journal);
  };
  const checkBudget = () => {
    if (stopped || Date.now() >= deadline) {stopped = true; throw Error("Canonical body stopped or elapsed deadline exceeded");}
  };
  const docker = (args: string[], input?: string) => {
    checkBudget();
    const r = spawnSync("docker", args, {input, encoding: "utf8", timeout: Math.min(10000, Math.max(1, deadline - Date.now())), maxBuffer: 8 * 1024 * 1024, windowsHide: true});
    checkBudget();
    if (r.error || r.status !== 0) throw Error("Bounded canonical reader failed; inspect journal, no retry");
    return r;
  };
  const qualify = () => {
    checkBudget();
    expect(process.env.ALGT_F06_DMS_CANONICAL_W38).toBe("1");
    expect(process.env.ALGT_F06_NATIVE_TARGET).toBe("native77c");
    expect(process.env.ALGT_F06_LOCAL_TARGET).toBeUndefined();
    expect(fs.realpathSync(process.cwd()).replaceAll("\\", "/")).toBe(candidateRoot);
    expect(fs.existsSync(`${runtimeRoot}/supabase/.temp/project-ref`)).toBe(false);
    const receipt = JSON.parse(fs.readFileSync(`${runtimeRoot}/startup-qualified.json`, "utf8"));
    const intent = JSON.parse(fs.readFileSync(`${runtimeRoot}/startup-intent.json`, "utf8"));
    expect(receipt.code).toBe(0); expect(receipt.timedOut).toBe(false);
    const admitted = receipt.resources.find((r: {name: string}) => r.name === "/supabase_db_algt-f06-native77c");
    expect(admitted.id).toMatch(/^[a-f0-9]{64}$/);
    const c = JSON.parse(docker(["inspect", admitted.id]).stdout)[0];
    expect(c.Id).toBe(admitted.id); expect(c.Name).toBe(admitted.name);
    expect(c.Config.Labels["com.supabase.cli.project"]).toBe("algt-f06-native77c");
    expect(c.Image).toBe("sha256:4c39816ce8d9303a3aba1161c842929c73a40c7109a9ef1b644582478e31832e");
    expect(c.State.Running).toBe(true);
    expect(c.HostConfig.PortBindings).toEqual({"5432/tcp": [{HostIp: "127.0.0.1", HostPort: "16882"}]});
    expect(Object.keys(c.NetworkSettings.Networks)).toEqual(["algt-f06-native77c-loopback"]);
    const net = JSON.parse(docker(["network", "inspect", "algt-f06-native77c-loopback"]).stdout)[0];
    expect(net.Id).toBe(intent.networkId); expect(net.Id).toBe(receipt.networkId);
    expect(net.Labels["algt.owner"]).toBe("f06"); expect(net.Internal).toBe(false);
    expect(net.Options["com.docker.network.bridge.host_binding_ipv4"]).toBe("127.0.0.1");
    if (containerId) {expect(c.Id).toBe(containerId); expect(c.State.StartedAt).toBe(started);}
    containerId = c.Id; started = c.State.StartedAt;
    const manifestBytes = fs.readFileSync(manifestPath);
    expect(createHash("sha256").update(manifestBytes).digest("hex")).toBe(manifestSha256);
    const manifest = JSON.parse(manifestBytes.toString("utf8")).migrations as {file: string; sha256: string}[];
    expect(manifest).toHaveLength(77);
    expect(new Set(manifest.map(m => m.file)).size).toBe(77);
    for (const m of manifest) {
      expect(m.file).toMatch(/^202610\d{8}_f06_[a-z0-9_]+\.sql$/);
      expect(createHash("sha256").update(fs.readFileSync(`${candidateRoot}/supabase/migrations/${m.file}`)).digest("hex")).toBe(m.sha256);
    }
    const replay = JSON.parse(fs.readFileSync(replayPath, "utf8"));
    expect(replay.state).toBe("PASS"); expect(replay.containerId).toBe(containerId);
    expect(replay.database).toBe("postgres"); expect(replay.image).toBe(c.Image);
    expect(replay.applied).toEqual(manifest); // exact source hashes AND application order
    for (const [file, hash] of pins) expect(hashBytes(fs.readFileSync(file, "utf8"))).toBe(hash);
    checkBudget();
  };
  // No caller-supplied SQL or target seam: statements below are closed test
  // literals with JSON data dollar-quoted using a delimiter absent from input.
  const quote = (raw: string) => {expect(raw).not.toContain("$manifest$"); return `$manifest$${raw}$manifest$`;};
  const query = (label: string, statement: string) => {
    if (stopped || !containerId) throw Error("Canonical reader stopped/unqualified");
    qualify(); note("read-intent", {label, sqlSha256: hashBytes(statement), readOnly: true});
    const r = docker(["exec", "-i", "-e", "PGPASSWORD=postgres", containerId, "psql", "-X", "-q", "-A", "-t", "-U", "supabase_admin", "-d", "postgres", "-v", "ON_ERROR_STOP=1"],
      `begin read only;set local statement_timeout='8s';set local lock_timeout='3s';set local idle_in_transaction_session_timeout='10s';set local client_encoding='UTF8';${statement};rollback;`);
    note("read-returned", {label, stdout: r.stdout.trim(), stderr: r.stderr.trim()}); return r;
  };
  beforeAll(() => {
    deadline = Date.now() + 50000;
    try {
    qualify();
    for (const file of [nativePath, libraryPath, migrationPath, referencePath, manifestPath, replayPath, `${runtimeRoot}/startup-qualified.json`, `${runtimeRoot}/startup-intent.json`]) pins.set(file, hashBytes(fs.readFileSync(file, "utf8")));
    journal = fs.openSync(path.join(evidenceRoot, `${marker}.jsonl`), "wx", 0o600);
    note("canonical-intent", {containerId, started, manifestSha256, orderedMigrations: 77, pins: Object.fromEntries(pins), positiveVectors: vectors.length, rejectionVectors: rejected.length,
      vectors: vectors.map(v => ({id: v.id, rawSha256: hashBytes(v.raw), literalSha256: v.hash})), rejections: rejected.map(v => ({id: v.id, rawSha256: v.raw === null ? null : hashBytes(v.raw), state: v.state, typescript: v.typescript})),
      noBusinessWrites: true, genuineAuth: false, fullCanonicalAdmission: false, uncovered: ["N01-N18", "UUID replay", "generated path separation", "contract revision/RPC envelope", "party visibility/existence", "Storage", "262144-byte schema-valid request equality"]});
    const actual = JSON.parse(query("catalog-qualification", `select jsonb_build_object('database',current_database(),'databaseOid',(select oid::integer from pg_database where datname=current_database()),'serverStarted',pg_postmaster_start_time(),'encoding',current_setting('server_encoding'),'readOnly',current_setting('transaction_read_only'),'functions',(select jsonb_agg(jsonb_build_object('name',p.proname,'source',p.prosrc,'immutable',p.provolatile='i','invoker',not p.prosecdef,'config',p.proconfig) order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='erp_private' and p.proname in ('batch_integer','batch_manifest_bytes')))` ).stdout) as {database: string; databaseOid: number; serverStarted: string; encoding: string; readOnly: string; functions: {name: string; source: string; immutable: boolean; invoker: boolean; config: string[]}[]};
    expect(actual.database).toBe("postgres"); expect(actual.databaseOid).toBeGreaterThan(0); expect(actual.encoding).toBe("UTF8"); expect(actual.readOnly).toBe("on");
    expect(actual.functions).toHaveLength(2);
    const migration = fs.readFileSync(migrationPath, "utf8").replaceAll("\r", "");
    for (const f of actual.functions) {
      const start = migration.indexOf(`create function erp_private.${f.name}(`), begin = migration.indexOf("as $$", start) + 5, end = migration.indexOf("$$;", begin);
      expect(start).toBeGreaterThan(-1); expect(end).toBeGreaterThan(begin);
      expect(f.source.replaceAll("\r", "")).toBe(migration.slice(begin, end));
      expect(f.immutable).toBe(true); expect(f.invoker).toBe(true); expect(f.config).toEqual(['search_path=""']);
    }
    databaseOid = actual.databaseOid; serverStarted = actual.serverStarted;
    const replayIdentity = JSON.parse(fs.readFileSync(replayPath, "utf8")).identity;
    expect(String(databaseOid)).toBe(String(replayIdentity.oid)); expect(serverStarted).toBe(replayIdentity.postmaster);
    checkBudget(); note("qualified", {databaseOid, serverStarted, functionSourcesMatched: true}); ready = true;
    } catch (error) {stopped = true; throw error;} finally {deadline = Number.POSITIVE_INFINITY;}
  }, 60000);
  const runBody = async (signal: AbortSignal, work: (live: () => void) => Promise<void>) => {
    if (bodyActive || stopped || !ready) throw Error("Prior canonical body unresolved or setup unavailable");
    bodyActive = true; deadline = Date.now() + 50000;
    const abort = () => {stopped = true; note("canonical-body-aborted", {bodyActive, noPass: true});};
    const live = () => {if (signal.aborted) stopped = true; checkBudget();};
    signal.addEventListener("abort", abort, {once: true});
    try {live(); await work(live); live(); passed++;}
    catch (error) {stopped = true; throw error;}
    finally {signal.removeEventListener("abort", abort); bodyActive = false; deadline = Number.POSITIVE_INFINITY;}
  };
  it("compares actual SQL UTF8/SHA and real TypeScript against independent literal vectors", async ({signal}) => runBody(signal, async live => {
    try {
      expect(ready).toBe(true);
      const inputs = vectors.map((v, i) => `(${i},${quote(v.raw)}::jsonb)`).join(",");
      const actual = JSON.parse(query("canonical-vectors", `select jsonb_agg(jsonb_build_object('index',i,'hex',encode(convert_to(bytes,'UTF8'),'hex'),'sha256',encode(sha256(convert_to(bytes,'UTF8')),'hex')) order by i) from (select i,erp_private.batch_manifest_bytes(v) bytes from (values ${inputs}) input(i,v)) canonical`).stdout) as {index: number; hex: string; sha256: string}[];
      expect(actual).toHaveLength(vectors.length);
      for (const [i, v] of vectors.entries()) {
        expect(hashBytes(v.literal), v.id).toBe(v.hash);
        expect(actual[i], v.id).toEqual({index: i, hex: Buffer.from(v.literal, "utf8").toString("hex"), sha256: v.hash});
        const manifest = batchManifestSchema.parse(JSON.parse(v.raw));
        expect(canonicalBatchManifest(manifest), v.id).toBe(v.literal);
        const fingerprint = await batchFingerprint(manifest); live();
        expect(fingerprint, v.id).toBe(v.hash);
      }
      live(); note("canonical-vectors-passed", {count: vectors.length});
    } catch (error) {stopped = true; note("canonical-vectors-failed", {}); throw error;}
  }), 60000);
  it("checks browser normalization separately from direct canonical SQL input", async ({signal}) => runBody(signal, async live => {
    try {
      expect(ready && !stopped).toBe(true);
      for (const mime_type of ["", "application/octet-stream", "application/pdf"]) {
        const normalized = dmsFileMetadataSchema.parse({original_filename: baseFile.original_filename, file_size_bytes: baseFile.file_size_bytes, mime_type, sha256_hash: h.toUpperCase()});
        expect(canonicalBatchManifest({...baseManifest, files: [{position: 0, ...normalized}]})).toBe(vectors[0].literal);
      }
      live(); note("metadata-normalization-passed", {count: 3, nativeCanonicalVector: "V01"});
    } catch (error) {stopped = true; note("metadata-normalization-failed", {}); throw error;}
  }), 60000);
  it("checks actual SQL numeric/schema/parser rejections without claiming RPC admission", async ({signal}) => runBody(signal, async live => {
    try {
      expect(ready && !stopped).toBe(true);
      for (const v of rejected) if (v.typescript) expect(batchManifestSchema.safeParse(JSON.parse(v.raw!)).success, v.id).toBe(false);
      const statements = rejected.map((v, i) => `begin perform erp_private.batch_manifest_bytes(${v.raw === null ? "null" : quote(v.raw) + "::jsonb"}); observed:='ACCEPTED';exception when others then get stacked diagnostics observed=returned_sqlstate;end;results:=results||jsonb_build_array(jsonb_build_object('index',${i},'state',observed));`).join("\n");
      const r = query("canonical-rejections", `do $rejections$ declare observed text;results jsonb:='[]';begin ${statements} raise notice 'W38_REJECTIONS=%',results::text;end $rejections$`);
      const line = r.stderr.split(/\r?\n/).find(l => l.includes("W38_REJECTIONS=")); expect(line).toBeDefined();
      const actual = JSON.parse(line!.slice(line!.indexOf("W38_REJECTIONS=") + 15));
      expect(actual).toEqual(rejected.map((v, index) => ({index, state: v.state})));
      live(); note("canonical-rejections-passed", {count: rejected.length, actual});
    } catch (error) {stopped = true; note("canonical-rejections-failed", {}); throw error;}
  }), 60000);
  afterAll(async () => {
    if (journal === undefined) return;
    if (bodyActive) {
      stopped = true; note("canonical-body-unresolved", {journalLeftOpen: true, noPass: true});
      const drainDeadline = Date.now() + 10000;
      while (bodyActive && Date.now() < drainDeadline) await new Promise(resolve => setTimeout(resolve, 25));
      if (bodyActive) throw Error("Canonical body still unwinding; journal retained open, final receipt withheld");
    }
    deadline = Date.now() + 30000;
    try {
      if (ready && !stopped) {
        const final = JSON.parse(query("final-identity", "select jsonb_build_object('databaseOid',(select oid::integer from pg_database where datname=current_database()),'serverStarted',pg_postmaster_start_time(),'readOnly',current_setting('transaction_read_only'))").stdout);
        expect(final).toEqual({databaseOid, serverStarted, readOnly: "on"});
      }
    } catch (error) {stopped = true; note("final-qualification-failed", {}); throw error;}
    finally {
      note("canonical-finished", {status: ready && !stopped && !bodyActive && passed === 3 ? "PASS_READ_ONLY_CANONICAL_TRANCHE" : "INCOMPLETE_OR_FAILED", passed, expected: 3, bodyActive, positiveVectors: vectors.length, rejectionVectors: rejected.length, fullCanonicalAdmission: false, nativeN01N18: false, databaseFixturesCreated: 0});
      fs.closeSync(journal); journal = undefined;
    }
  }, 45000);
});

type ScenarioId = `N${"01" | "02" | "03" | "04" | "05" | "06" | "07" | "08" | "09" | "10" | "11" | "12" | "13" | "14" | "15" | "16" | "17" | "18"}`;
type Boundary = "sql" | "caller" | "storage";
type Backend = { pid: number; startedAt: string; databaseOid: number; application: string };
type Wait = { holder: Backend; contender: Backend; blockers: number[]; dependency: string; observed: boolean };
type Counts = { headers: number; members: number; audits: number };
type NativeEvidence = {
  caseId: ScenarioId; boundary: Boundary; candidateHash: string; admissionReceiptHash: string;
  fixtureReceiptHash: string; containerId: string; imageId: string; containerStartedAt: string;
  serverStartedAt: string; databaseOid: number; sourceUnchanged: boolean; targetUnchanged: boolean;
  fixtureOwnershipChecked: boolean; genuineSessionsChecked: boolean; beforeHash: string; afterHash: string;
  numberingBeforeHash: string; numberingAfterHash: string; unrelatedBeforeHash: string; unrelatedAfterHash: string;
  counts: Counts; receipts: unknown[]; expectedFiles: number; outcomes: string[]; waits: Wait[];
  exactBackendsAbsent: boolean; exactFaultObjectsAbsent: boolean; intentsDurable: boolean;
  requiredAssertions: Record<string, boolean>; rawSecretsEmitted: boolean;
  canonical: {id: string; sqlBytes: string; sqlSha256: string}[];
};
// This closed case API is a proposed assertion seam, not permission to supply
// arbitrary SQL/targets. Its missing main-reviewed implementation is explicit.
async function runMainScenario(caseId: ScenarioId): Promise<NativeEvidence> {
  throw new Error(`MAIN_NATIVE_WIRING_OPEN: ${caseId} has no reviewed target/fixture driver`);
}
const sha = /^[0-9a-f]{64}$/;
function common(e: NativeEvidence, id: ScenarioId, boundary: Boundary) {
  expect(e.caseId).toBe(id); expect(e.boundary).toBe(boundary);
  for (const hash of [e.candidateHash, e.admissionReceiptHash, e.fixtureReceiptHash, e.beforeHash, e.afterHash]) expect(hash).toMatch(sha);
  expect(e.containerId).toMatch(sha); expect(e.imageId).toMatch(/^sha256:[0-9a-f]{64}$/);
  expect(e.containerStartedAt).not.toBe(""); expect(e.serverStartedAt).not.toBe("");
  expect(e.databaseOid).toBeGreaterThan(0);
  for (const flag of [e.sourceUnchanged, e.targetUnchanged, e.fixtureOwnershipChecked, e.genuineSessionsChecked,
    e.exactBackendsAbsent, e.exactFaultObjectsAbsent, e.intentsDurable]) expect(flag).toBe(true);
  expect(e.rawSecretsEmitted).toBe(false);
  expect(e.numberingAfterHash).toBe(e.numberingBeforeHash);
  expect(e.unrelatedAfterHash).toBe(e.unrelatedBeforeHash);
}
function checks(e: NativeEvidence, names: readonly string[]) {
  for (const name of names) expect(e.requiredAssertions[name], `missing actual native assertion ${name}`).toBe(true);
}
function exactGraph(e: NativeEvidence): BatchReceipt[] {
  expect(e.counts).toEqual({headers: 1, members: e.expectedFiles, audits: e.expectedFiles + 1});
  expect(e.receipts.length).toBeGreaterThan(0);
  const receipts = e.receipts.map(r => batchReceiptSchema.parse(r));
  for (const receipt of receipts) expect(receipt).toEqual(receipts[0]);
  return receipts;
}
function realWaits(e: NativeEvidence) {
  expect(e.waits.length).toBeGreaterThan(0);
  for (const wait of e.waits) {
    expect(wait.observed).toBe(true); expect(wait.holder.pid).not.toBe(wait.contender.pid);
    expect(wait.blockers).toEqual([wait.holder.pid]);
    for (const backend of [wait.holder, wait.contender]) {
      expect(backend.databaseOid).toBe(e.databaseOid); expect(backend.startedAt).not.toBe("");
      expect(backend.application).not.toBe(""); expect(Buffer.byteLength(backend.application)).toBeLessThanOrEqual(63);
    }
    expect(wait.dependency).not.toBe("");
  }
}
const cases: readonly {id: ScenarioId; boundary: Boundary; assertions: readonly string[]; graph?: boolean; waits?: boolean}[] = [
  {id: "N01", boundary: "caller", graph: true, assertions: ["scoped_upload_only", "company_wide", "global_null_tuple", "existing_global_admin_witness", "scoped_admin_own_graph", "insert_returning", "no_unrelated_grants", "no_storage_provider_calls"]},
  {id: "N02", boundary: "sql", assertions: ["anonymous", "revoked_session", "expired_session", "banned_user", "deleted_user", "inactive_profile", "forced_password", "inactive_role", "inactive_assignment", "inactive_permission", "missing_pair", "mixed_incomplete_witness", "same_branch_nonowner", "scoped_admin_cannot_replay_foreign_origin", "zero_row_updates_preserve_original"]},
  {id: "N03", boundary: "sql", assertions: ["header_fault", "first_child_fault", "last_child_fault", "first_audit_fault", "last_audit_fault", "deferred_graph_fault", "all_graphs_rolled_back", "same_operation_after_removed_fault", "surrogate_gaps_not_reset"]},
  {id: "N04", boundary: "sql", assertions: ["normal_commit_valid_graph", "normal_commit_header_only_denies", "missing_extra_duplicate_negative_gapped_position", "forged_origin_scope_manifest_context", "supplied_code_path_denies", "forged_audit_denies", "named_immediate_before_insert", "all_immediate_before_insert", "outer_commit_after_faulty_child_savepoint_denies", "caught_rpc_error_unrelated_outer_commit"]},
  {id: "N05", boundary: "sql", assertions: ["every_anchor_nulling", "every_member_nulling", "legacy_modern_transition_denies", "identity_and_created_timestamp_immutable", "nonnull_document_binding_immutable", "privileged_no_auth_identity_guard", "delete_special_audit_denies", "fk_set_null_denies", "append_complete_graph_denies", "intended_lifecycle_preserves_full_graph"]},
  {id: "N06", boundary: "sql", graph: true, waits: true, assertions: ["two_callers_commit_one_graph", "three_callers_commit_one_graph", "exact_operation_advisory_edge", "same_receipt_after_action_replay"]},
  {id: "N07", boundary: "sql", graph: true, waits: true, assertions: ["holder_rollback", "contender_complete_commit", "no_holder_history", "same_operation"]},
  {id: "N08", boundary: "sql", waits: true, assertions: ["changed_order_conflict", "changed_context_conflict", "changed_hash_conflict", "different_actor_same_uuid_separate_graph", "no_foreign_receipt"]},
  {id: "N09", boundary: "sql", waits: true, assertions: ["user_wins", "session_wins", "profile_wins", "assignment_wins", "role_wins", "permission_wins", "pair_wins", "company_wins", "branch_wins", "flag_wins", "party_wins", "one_current_tuple_or_full_denial", "no_uncaptured_authority_witness", "captured_scoped_party_pair_plus_late_uncaptured_global_pair_denies"]},
  {id: "N10", boundary: "sql", waits: true, assertions: ["admission_wins", "revoker_waits_exact_dependency", "later_revocation_stops_capability", "redundant_complete_witness_is_lawful", "no_test_latch_deadlock"]},
  {id: "N11", boundary: "sql", assertions: ["flag_disabled_same_receipt", "expired_timestamp_uploaded_status", "cancelled_and_soft_deleted_members_retained", "completed_batch_not_revived", "profile_transfer_no_repin", "same_auth_new_genuine_session_same_receipt", "old_session_denied", "fresh_signable_subset", "discovery_original_principal_only"]},
  {id: "N12", boundary: "caller", assertions: ["before_known_commit_loss", "postcommit_presign_loss", "partial_sign_loss", "full_sign_loss", "same_graph_same_operation", "later_rejection_retains_prior_uncertainty", "no_delete_or_cancel_compensation"]},
  {id: "N13", boundary: "caller", assertions: ["first_last_sign_failure", "missing_token", "wrong_path", "malformed_receipt", "cache_failure", "revoke_before_and_during_sign", "ordinary_business_reads_only", "explicit_non_upsert", "partial_capabilities_withheld", "issued_bearer_not_claimed_revoked"]},
  {id: "N14", boundary: "storage", assertions: ["actual_info_shape", "normal_upload_byte_proof", "lost_response_byte_proof", "info_bytes_info_same_uuid_version_size", "wrong_hash_conflict", "replacement_during_read_denies", "metadata503_not_absence", "oversize_before_download", "absence_then_original_upload_409_reobserve", "no_overwrite_delete", "bounded_stream_deadline"]},
  {id: "N15", boundary: "sql", assertions: ["invalid_relationship_before_analysis_required", "invalid_relationship_before_allocator", "stale_binding_denies", "historical_completed_consumed_replay", "current_document_authority_required"]},
  {id: "N16", boundary: "sql", waits: true, assertions: ["session_holder_replay_readonly", "sessions_ascending_then_batch_cancel", "consumer_session_reference_analysis_batch_party_taxonomy", "no_batch_existing_session_inversion", "exact_failed_contender_preimage"]},
  {id: "N17", boundary: "sql", waits: true, assertions: ["bounded_lock_timeout", "bounded_statement_timeout", "holder_rollback_finally", "same_operation_recovery", "unknown_commit_retained", "backend_identity_not_pid_only", "no_auto_retry"]},
  {id: "N18", boundary: "sql", assertions: ["valid_unanimous_legacy_scoped", "empty_denies", "count_mismatch_denies", "null_creator_denies", "null_uploader_denies", "mixed_uploader_denies", "mixed_tuple_denies", "mixed_null_tuple_denies", "extra_soft_deleted_member_denies", "legacy_columns_remain_null", "no_legacy_modern_receipt", "ordinary_legacy_insert_denies", "null_type_nonnull_id_before_analysis_and_allocator_denies", "party_type_null_id_consumed_replay_denies", "unsafe_context_id_denies"]},
];

describe.skip("MAIN_NATIVE_WIRING_OPEN — main-only batch N01–N18, no native acceptance yet", () => {
  beforeAll(() => { throw new Error("MAIN_NATIVE_WIRING_OPEN: fresh reviewed driver and receipt origin required"); });
  for (const scenario of cases) it(`${scenario.id}: ${scenario.boundary}`, async () => {
    const evidence = await runMainScenario(scenario.id);
    common(evidence, scenario.id, scenario.boundary);
    checks(evidence, scenario.assertions);
    if (scenario.graph) exactGraph(evidence);
    if (scenario.waits) realWaits(evidence);
  });
  it("SQL canonical V01/V03/V04/V05 equals independent literal bytes and digests", async () => {
    // Native driver must return actual SQL bytes for all V01–V11 families;
    // these literals are reference anchors, not a claim of SQL execution.
    const vectors = [
      ["V01", '["dms-batch-admission/v1",null,[[0,"a.pdf","application/pdf",1,"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]]]', "1b97f3098fb2e29b43e7641d17a9b6efca8ae3fd284215291a93a4f33cfdf437"],
      ["V03", '["dms-batch-admission/v1",null,[[0,"a\\"b\\\\c.PDF","application/pdf",1,"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]]]', "b96fbcdfe330d28438a14e9ee1c8f8264ff0e03be2604f349137e587288d41cc"],
      ["V04", '["dms-batch-admission/v1",["party",42],[[0,"é-📄.pdf","application/pdf",52428800,"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]]]', "d2e231825b2311c7fe0368725bf9de7da795a01bcf83d15357c6ff162576683d"],
      ["V05", '["dms-batch-admission/v1",["party",42],[[0,"é-📄.pdf","application/pdf",52428800,"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]]]', "72ca9b0cd89dd1075bfc61c8dab901513fbe812c4024d61ebac0ce744eb98f0d"],
    ];
    const evidence = await runMainScenario("N01");
    common(evidence, "N01", "caller");
    for (const [id, bytes, hash] of vectors) {
      expect(createHash("sha256").update(bytes, "utf8").digest("hex")).toBe(hash);
      expect(evidence.canonical.find(v => v.id === id)).toEqual({id, sqlBytes: bytes, sqlSha256: hash});
    }
    checks(evidence, ["V01_base", "V02_normalization", "V03_escaping", "V04_unicode", "V05_no_normalization",
      "V06_order", "V07_duplicates_and_path_collision", "V08_numeric_scale_scalar_bounds", "V09_null_wrong_primitive_unicode_parser",
      "V10_explicit_extension_matrix", "V11_parsed_size_version_keys", "uuid_case_same_operation", "W_scalar_set_preserved"]);
  });
});
