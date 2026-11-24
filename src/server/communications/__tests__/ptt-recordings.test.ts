import { describe, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
import { inspectPttWave } from "../ptt-recordings";

function wav(frames: number, rate=8000) {
  const bytes=Buffer.alloc(44+frames*2);
  bytes.write("RIFF",0);bytes.writeUInt32LE(bytes.length-8,4);bytes.write("WAVEfmt ",8);
  bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);
  bytes.writeUInt32LE(rate,24);bytes.writeUInt32LE(rate*2,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);
  bytes.write("data",36);bytes.writeUInt32LE(frames*2,40);return bytes;
}
describe("verified PTT PCM",()=>{
  it("derives duration, byte size and integrity from bytes including exact 60 seconds",()=>{
    const bytes=wav(480000);
    const result=inspectPttWave(bytes);
    expect(result).toMatchObject({durationMs:60000,byteSize:960044});
    bytes[44]=42;
    expect(inspectPttWave(bytes).sha256).not.toBe(result.sha256);
  });
  it("rejects partial files, surplus frames, wrong MIME signature, invalid layout and empty audio",()=>{
    const short=wav(8000);
    for(const broken of [short.subarray(0,-1),wav(480001),wav(0),Buffer.concat([short,Buffer.from([0])])])
      expect(()=>inspectPttWave(broken)).toThrow();
    for(const offset of [0,4,8,16,20,22,24,28,32,34,36,40]){
      const b=Buffer.from(short);b[offset]^=0x80;expect(()=>inspectPttWave(b)).toThrow();
    }
  });
});
