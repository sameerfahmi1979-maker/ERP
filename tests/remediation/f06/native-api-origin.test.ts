import {afterEach,beforeEach,expect,it,vi} from 'vitest';
beforeEach(()=>{vi.resetModules();vi.stubEnv('ALGT_F06_NATIVE_TARGET',undefined);vi.stubEnv('ALGT_F06_LOCAL_TARGET',undefined);});
afterEach(()=>{vi.unstubAllEnvs();vi.resetModules();});
it('default remains the historical isolated local API',async()=>{
 expect((await import('./native-api-origin.mjs')).nativeApiOrigin).toBe('http://127.0.0.1:16621');
});
it('new native namespace selects only its own loopback API',async()=>{
 vi.stubEnv('ALGT_F06_NATIVE_TARGET','native77b');
 expect((await import('./native-api-origin.mjs')).nativeApiOrigin).toBe('http://127.0.0.1:16781');
});
it('rejects an unknown native target',async()=>{
 vi.stubEnv('ALGT_F06_NATIVE_TARGET','production');await expect(import('./native-api-origin.mjs')).rejects.toThrow();
});
it('corrected native namespace selects only its own loopback API',async()=>{
 vi.stubEnv('ALGT_F06_NATIVE_TARGET','native77c');
 expect((await import('./native-api-origin.mjs')).nativeApiOrigin).toBe('http://127.0.0.1:16881');
});
it.each([undefined,'native77b','native77c'])('rejects replay/API split with native=%s',async(native)=>{
 vi.stubEnv('ALGT_F06_NATIVE_TARGET',native);vi.stubEnv('ALGT_F06_LOCAL_TARGET','candidate-replay');
 await expect(import('./native-api-origin.mjs')).rejects.toThrow('Native API tests never target a named replay clone');
});
