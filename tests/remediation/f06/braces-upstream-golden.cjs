'use strict';
// Generates a reviewable immutable upstream oracle. Refuses a patched source.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(process.argv[2] || 'node_modules/braces');
const provenance = require('../../../vendor/braces/PROVENANCE.json');
for (const [file, hash] of Object.entries(provenance.originalFiles)) {
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex'), hash, file);
}
const upstream = require(root);
const direct = Object.fromEntries(['compile', 'expand', 'stringify'].map(name => [name, require(path.join(root, 'lib', name))]));
const patterns = ['', 'x', 'plain/path', '{a,b}', 'a/{b,c}/d', '{a,{b,c}}', '{{a,b},c}',
  '{1..5}', '{05..01}', '{a..e..2}', '{1..9..2}', '{a,a,b}', '{,a,,b}',
  '{}', '{literal}', '${literal}', '{a,b', 'a,b}', '(a/{b,c})', '\\{a,b\\}', '"{a,b}"', '[a{b,c}]', '{a..z,1..3}'];
const options = [{}, { expand: true }, { expand: true, nodupes: true, noempty: true },
  { keepEscaping: true }, { keepQuotes: true }, { escapeInvalid: true },
  { expand: true, escapeInvalid: true }, { toRegex: true, wrap: true }];
const golden = { originalFiles: provenance.originalFiles, outputs: {} };
const capture = (kind, method, input, opts, result) => {
  golden.outputs[JSON.stringify([kind, method, input, opts])] = result;
};
for (const pattern of patterns) {
  for (const opts of options) {
    for (const method of ['create', 'compile', 'expand', 'stringify']) capture('public', method, pattern, opts, upstream[method](pattern, opts));
    capture('batch', 'call', pattern, opts, upstream([pattern, '{z,y}'], opts));
    for (const method of ['compile', 'expand', 'stringify']) capture('direct', method, pattern, opts, direct[method](upstream.parse(pattern), opts));
  }
}
const nesting = (depth, kind, balanced) => {
  const opens = Array.from({ length: depth }, (_, index) => kind === 'mixed' ? (index % 2 ? '(' : '{') : kind === 'paren' ? '(' : '{');
  return opens.join('') + 'x' + (balanced ? opens.reverse().map(value => value === '(' ? ')' : '}').join('') : '');
};
for (const depth of [99, 100]) {
  for (const kind of ['brace', 'paren', 'mixed']) {
    for (const balanced of [true, false]) {
      const input = nesting(depth, kind, balanced);
      for (const method of ['compile', 'expand', 'stringify']) capture('public', method, input, {}, upstream[method](input));
    }
  }
}
for (const input of ['"' + '{'.repeat(4999) + '"', '[' + '('.repeat(4999) + ']', '\\{'.repeat(4999)]) capture('public', 'compile', input, {}, upstream.compile(input));
capture('public', 'expand', '{1..1001}', { rangeLimit: false }, upstream.expand('{1..1001}', { rangeLimit: false }));
process.stdout.write(JSON.stringify(golden, null, 2) + '\n');
