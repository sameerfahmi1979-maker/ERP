import assert from "node:assert/strict";
import { generateKeyPairSync, randomUUID, verify } from "node:crypto";
import test from "node:test";
import { launch } from "./launch-communication-worker.mjs";

const boot = randomUUID();
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const key = privateKey.export({ format: "pem", type: "pkcs8" });
const grant = JSON.stringify({v:1,kind:"chat_stage",boot,notBefore:new Date(Date.now()-1000),registerBy:new Date(Date.now()+60000)});
test("submits only the committed SQL receipt to the fixed private endpoint, once, with redirects disabled", async () => {
  const events = [];
  await launch(boot, key, {
    debit(id, attempt) { assert.equal(id, boot); assert.match(attempt, /^[a-f0-9-]{36}$/); events.push("debit"); return grant; },
    async send(url, init) {
      events.push("send");
      assert.equal(url, "https://erp.algt.net/api/internal/communications/worker-launch");
      assert.equal(init.method, "POST"); assert.equal(init.redirect, "error"); assert.equal(init.body, undefined);
      const [body, sig] = init.headers.Authorization.slice(7).split(".").map(value => Buffer.from(value, "base64url"));
      assert.equal(body.toString(), grant); assert.ok(verify(null, body, publicKey, sig)); return {status:204};
    }
  });
  assert.deepEqual(events, ["debit", "send"]);
});
test("no signature delivery for missing or ambiguous debit, rejected targets or lost acknowledgments get no retry", async () => {
  for (const debit of [() => "", () => { throw Error("disconnected"); }, () => JSON.stringify({ ...JSON.parse(grant), boot: randomUUID() })]) {
    let calls = 0;
    await assert.rejects(launch(boot, key, { debit, send: async () => { calls++; } }));
    assert.equal(calls, 0);
  }
  for (const result of [() => ({status:409}), () => { throw Error("lost"); }]) {
    let calls = 0;
    await assert.rejects(launch(boot, key, { debit: () => grant, send: async () => { calls++; return result(); } }));
    assert.equal(calls, 1);
  }
});
