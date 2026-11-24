// Node-only WebCrypto/IndexedDB exercise. Pass an isolated fake-indexeddb/auto installation and artifact directory.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const root = path.resolve(__dirname, "../.."),
  testDir = fs.mkdtempSync(path.join(path.resolve(process.argv[3]), "chat-crypto-"));
require(path.resolve(process.argv[2]));
process.env.NODE_PATH = [path.join(root, "node_modules"), process.env.NODE_PATH]
  .filter(Boolean)
  .join(path.delimiter);
require("node:module").Module._initPaths();
const ts = require("typescript"),
  ls = new Map();
global.localStorage = { getItem: (k) => ls.get(k) ?? null, setItem: (k, v) => ls.set(k, v) };
global.document = { cookie: "" };
for (const name of ["model", "client", "vault", "offline-session", "continuation"]) {
  const src = fs.readFileSync(path.join(root, "src/features/messages", name + ".ts"), "utf8");
  fs.writeFileSync(
    path.join(testDir, name + ".js"),
    ts.transpileModule(src, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText,
  );
}
function page() {
  for (const k of Object.keys(require.cache)) if (k.startsWith(testDir + path.sep)) delete require.cache[k];
  return Object.assign(
    {},
    ...["vault", "offline-session", "continuation"].map((n) => require(path.join(testDir, n + ".js"))),
  );
}
const b64 = (v) => Buffer.from(v).toString("base64url"),
  random = () => b64(crypto.randomBytes(32));
const cookieName = "sb-demo-auth-token",
  sig = new AbortController().signal;
const hash = (s) => crypto.createHash("sha256").update(s).digest("hex");
function identity(account, sid, profile) {
  return {
    binding: { account, session: hash(sid), expectedProfile: profile },
    sid,
    refresh: random(),
    signature: random(),
  };
}
function useLogin(i) {
  const auth = {
    refresh_token: i.refresh,
    access_token:
      "header." +
      b64(JSON.stringify({ sub: i.binding.account, session_id: i.sid, exp: 1 })) +
      "." +
      i.signature,
  };
  const data = "base64-" + b64(JSON.stringify(auth));
  const mid = Math.floor(data.length / 2);
  document.cookie = cookieName + ".0=" + data.slice(0, mid) + "; " + cookieName + ".1=" + data.slice(mid);
}
async function online(p, user, secret) {
  useLogin(user);
  const b = user.binding;
  p.bindTransportSession(b.session);
  const guard = await p.continuationState();
  await p.unlockVault(b.account, b.session, secret, sig, { epoch: guard.epoch, binding: b, cookieName });
  p.rememberMessagingSession(b);
  return new p.Vault(b.account, b.session, b.expectedProfile, true);
}
async function cold(p) {
  const { key, binding: b } = await p.recoverContinuation();
  assert.equal(key.extractable, false);
  p.bindTransportSession(b.session);
  p.rememberCacheKey(b.account, b.session, key);
  return new p.Vault(b.account, b.session, b.expectedProfile, true);
}
const req = (r) =>
  new Promise((ok, no) => {
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
  });
(async () => {
  const A = identity("accountA", "sessionA1", "9"),
    B = identity("accountB", "sessionB1", "10"),
    kA = random(),
    kB = random();
  const first = page(),
    v = await online(first, A, kA);
  await v.put("compose/thread", { body: "private draft" });
  await v.put("cache/thread/history", { session: v.session, messages: [{ body: "cached text" }] });
  const rawDb = await req(indexedDB.open("algt-messages-v1", 1));
  const wrapped = await req(rawDb.transaction("keys").objectStore("keys").get("accountA"));
  assert(wrapped instanceof ArrayBuffer);
  assert.equal(wrapped.byteLength, 40);
  const stored = await req(
    rawDb.transaction("records").objectStore("records").get("accountA/compose/thread"),
  );
  assert(!Buffer.from(stored.cipher).includes(Buffer.from("private draft")));
  assert(!JSON.stringify(await first.continuationState()).includes(A.refresh));
  const thread={id:"thread",title:"Synthetic colleague",archived:false};
  await v.put("cache/inbox/false",{session:v.session,items:[thread]});
  await v.put("cache/thread/history",{session:v.session,conversation:thread,messages:[{body:"cached text",sentAt:new Date().toISOString(),attachments:[],senderName:"Synthetic author"}]});
  const {JSDOM}=require("jsdom"),shell=fs.readFileSync(path.join(root,"public/messages-offline.html"),"utf8");
  const dom=new JSDOM(shell,{url:"https://erp.test/messages?conversationId=thread",pretendToBeVisual:true,runScripts:"outside-only"});
  for(const part of document.cookie.split("; "))dom.window.document.cookie=part+"; Path=/";
  const sandbox=dom.getInternalVMContext();
  for(const [key,value] of Object.entries({crypto:global.crypto,indexedDB,IDBKeyRange,TextEncoder,TextDecoder,structuredClone,AbortController,AbortSignal,ArrayBuffer,Uint8Array,Blob,File})){
    Object.defineProperty(sandbox,key,{configurable:true,value});
  }
  require("node:vm").runInContext(fs.readFileSync(path.join(root,"public/messages-offline.mjs"),"utf8"),sandbox);
  const waitText=async text=>{for(let i=0;i<100;i++){if(dom.window.document.body.textContent.includes(text))return;await new Promise(r=>setTimeout(r,15));}throw Error("Offline HTML proof failed: "+dom.window.document.body.textContent);};
  await waitText("cached text");Array.from(dom.window.document.querySelectorAll("button")).find(b=>b.textContent==="Back to inbox").click();await waitText("Cached conversations");dom.window.close();
  const second = page(),
    offline = await cold(second);
  assert.equal((await offline.get("cache/thread/history")).messages[0].body, "cached text");
  const intent = {
    id: crypto.randomUUID(),
    session: offline.session,
    conversationId: "thread",
    state: "queued",
    body: "pending",
    createdAt: "t",
    uploads: [],
    mentions: [],
  };
  await offline.persistIntent(intent, [], "compose/thread");
  assert.equal((await offline.intents("thread"))[0].body, "pending");
  assert.equal(await offline.get("compose/thread"), null);
  useLogin({ ...A, refresh: random() });
  await assert.rejects(() => page().recoverContinuation()); // unseen rotation locks cold entry
  const rotated = { ...A, refresh: random(), signature: random() };
  await online(second, rotated, kA);
  await cold(page());
  const snapshot = await second.continuationState();
  await second.retireContinuation(A.binding.session);
  second.clearMessagingSession();
  await assert.rejects(() => v.get("cache/thread/history"));
  await assert.rejects(() => page().recoverContinuation());
  // A paused writer with the correct former secret cannot resurrect a retired session.
  await assert.rejects(() =>
    first.unlockVault("accountA", A.binding.session, kA, sig, {
      epoch: snapshot.epoch,
      binding: A.binding,
      cookieName,
    }),
  );
  const other = page();
  const vb = await online(other, B, kB);
  assert.equal(await vb.get("compose/thread"), null);
  useLogin(rotated);
  await assert.rejects(() => page().recoverContinuation());
  const again = page(),
    A2 = identity("accountA", "sessionA2", "9");
  useLogin(A2);
  again.bindTransportSession(A2.binding.session);
  await assert.rejects(() => again.unlockVault("accountA", A2.binding.session, kB, sig));
  const restored = await online(again, A2, kA);
  const pending = (await restored.intents("thread"))[0];
  assert.notEqual(pending.session, restored.session);
  await assert.rejects(() => restored.send(pending, sig), /Review/);
  document.cookie = "";
  await assert.rejects(() => page().recoverContinuation());
  await assert.rejects(() => again.unlockVault("accountA", A2.binding.session, "", sig));
  console.log(
    "PASS Node WebCrypto + synthetic IndexedDB. Encrypted bytes and wrapped keys only; cold reload with expired access timestamp and same token material; offline queue; token rotation mismatch and online reseal; A/logout/B/A; stale writer rejection; wrong/missing material; scoped manual draft re-send.",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
