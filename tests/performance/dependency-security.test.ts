import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {expect, it} from 'vitest';

const require = createRequire(import.meta.url);
const proxyaddr = require('proxy-addr');
const {SourceMapConsumer} = require('source-map-js');
const map = {version:3, sources:['input.js'], names:[], mappings:'AAAA'};
const indexed = (line:number, column=0) => ({version:3, sections:[{offset:{line,column},map}]});

it('locks the reviewed upstream patches without changing application dependencies', () => {
  const lock = JSON.parse(readFileSync('package-lock.json','utf8'));
  expect(lock.packages['node_modules/proxy-addr'].version).toBe('2.0.8');
  expect(lock.packages['node_modules/source-map-js'].version).toBe('1.2.2');
});
it('does not trust arbitrary IPv4 clients through an underspecified mapped IPv6 prefix', () => {
  expect(proxyaddr.compile('::ffff:10.0.0.0/8')('203.0.113.5')).toBe(false);
});
it('does not trust IPv4 clients through a broad zero-leading IPv6 prefix', () => {
  expect(proxyaddr.compile('::/1')('203.0.113.5')).toBe(false);
});
it('preserves valid plain IPv4 trust ranges', () => {
  const trust = proxyaddr.compile('10.0.0.0/8');
  expect(trust('10.1.2.3')).toBe(true);
  expect(trust('203.0.113.5')).toBe(false);
});
it('preserves valid full mapped IPv6 trust prefixes', () => {
  const trust = proxyaddr.compile('::ffff:10.0.0.0/104');
  expect(trust('10.1.2.3')).toBe(true);
  expect(trust('203.0.113.5')).toBe(false);
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
