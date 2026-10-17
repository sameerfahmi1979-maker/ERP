// Closed, local-only API selection. Import has no I/O or service side effects.
import assert from 'node:assert/strict';
assert.ok(process.env.ALGT_F06_NATIVE_TARGET===undefined||['native77b','native77c'].includes(process.env.ALGT_F06_NATIVE_TARGET));
assert.equal(process.env.ALGT_F06_LOCAL_TARGET,undefined,'Native API tests never target a named replay clone');
export const nativeApiOrigin=process.env.ALGT_F06_NATIVE_TARGET==='native77c'?'http://127.0.0.1:16881':process.env.ALGT_F06_NATIVE_TARGET==='native77b'?'http://127.0.0.1:16781':'http://127.0.0.1:16621';
