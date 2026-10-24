import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {expect, it} from 'vitest';

const require = createRequire(import.meta.url);
const {SourceMapConsumer} = require('source-map-js');
const map = {version:3, sources:['input.js'], names:[], mappings:'AAAA'};
const indexed = (line:number, column=0) => ({version:3, sections:[{offset:{line,column},map}]});

it('locks the retained source-map security patch', () => {
  const lock = JSON.parse(readFileSync('package-lock.json','utf8'));
  expect(lock.packages['node_modules/source-map-js'].version).toBe('1.2.2');
});
// F12 removed the unused shadcn CLI and its proxy-addr dependency entirely.
// Guard that removal rather than reinstalling dead code to exercise old tests.
it('does not retain the removed CLI or proxy package anywhere in the lock', () => {
  const lock = JSON.parse(readFileSync('package-lock.json','utf8'));
  expect(Object.keys(lock.packages).filter(key => /(?:^|\/)node_modules\/(?:shadcn|proxy-addr)$/.test(key))).toEqual([]);
});
it('does not declare the removed CLI or proxy as direct or optional dependencies', () => {
  const pkg = JSON.parse(readFileSync('package.json','utf8'));
  for (const section of ['dependencies','devDependencies','optionalDependencies']) {
    expect(pkg[section] ?? {}).not.toHaveProperty('shadcn');
    expect(pkg[section] ?? {}).not.toHaveProperty('proxy-addr');
  }
});
it('cannot resolve the removed proxy package from the installed application', () => {
  expect(() => require.resolve('proxy-addr')).toThrowError(expect.objectContaining({code:'MODULE_NOT_FOUND'}));
});
it('preserves the reviewed UI stylesheet and licence without the CLI', () => {
  const digest = (file:string) => createHash('sha256').update(readFileSync(file,'utf8').replace(/\r\n/g,'\n')).digest('hex');
  expect(digest('vendor/shadcn/tailwind.css')).toBe('146941ac3ff65496fdf1cb306e697255328e4dadc7c105d66e36bb031b00f6d6');
  expect(digest('vendor/shadcn/LICENSE.md')).toBe('1564074e13439397221ffd522e2e504d56561994a23d371aa5e3ad43e4f5423f');
  expect(readFileSync('src/app/globals.css','utf8')).toContain('@import "../../vendor/shadcn/tailwind.css"');
});
it('rejects excessive indexed source-map line offsets at construction', () => {
  expect(() => new SourceMapConsumer(indexed(10000001))).toThrow(/must not exceed/);
});
it('rejects invalid indexed source-map offsets', () => {
  for (const offset of [-1, 0.5, Infinity, NaN]) {
    expect(() => new SourceMapConsumer(indexed(offset))).toThrow(/non-negative integers/);
  }
});
it('rejects cumulative excessive nested source-map offsets', () => {
  const nested = {version:3, sections:[{offset:{line:6000000,column:0}, map:indexed(6000000)}]};
  expect(() => new SourceMapConsumer(nested)).toThrow(/including offsets of nested sections/);
});
it('preserves ordinary indexed source-map translated mappings', () => {
  const consumer = new SourceMapConsumer(indexed(2));
  const mappings: unknown[] = [];
  consumer.eachMapping((mapping:unknown) => mappings.push(mapping));
  expect(mappings).toEqual([expect.objectContaining({source:'input.js',generatedLine:3,generatedColumn:0,originalLine:1,originalColumn:0})]);
});
