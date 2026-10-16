'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const target = path.resolve(process.env.ALGT_F06_BRACES_PACKAGE_ROOT || path.join(__dirname, '../../../vendor/braces'));
const patched = require(target);
const direct = Object.fromEntries(['parse', 'compile', 'expand', 'stringify'].map(name =>
  [name, require(path.join(target, 'lib', name))]));
const flatten = require(path.join(target, 'lib/utils')).flatten;
const golden = require('./braces-upstream-golden.json');
const upstream = (kind, method, input, opts = {}) => {
  const key = JSON.stringify([kind, method, input, opts]);
  assert.ok(Object.hasOwn(golden.outputs, key), 'upstream golden output exists');
  return golden.outputs[key];
};

test('target retains original package identity and golden provenance', () => {
  const identity = require(path.join(target, 'package.json'));
  assert.equal(identity.name, 'braces');
  assert.equal(identity.version, '3.0.3');
  assert.equal(identity.license, 'MIT');
  assert.deepEqual(golden.originalFiles, require('../../../vendor/braces/PROVENANCE.json').originalFiles);
});

const patterns = [
  '', 'x', 'plain/path', '{a,b}', 'a/{b,c}/d', '{a,{b,c}}', '{{a,b},c}',
  '{1..5}', '{05..01}', '{a..e..2}', '{1..9..2}', '{a,a,b}', '{,a,,b}',
  '{}', '{literal}', '${literal}', '{a,b', 'a,b}', '(a/{b,c})',
  '\\{a,b\\}', '"{a,b}"', '[a{b,c}]', '{a..z,1..3}'
];
const options = [{}, { expand: true }, { expand: true, nodupes: true, noempty: true },
  { keepEscaping: true }, { keepQuotes: true }, { escapeInvalid: true },
  { expand: true, escapeInvalid: true }, { toRegex: true, wrap: true }];

for (const [index, pattern] of patterns.entries()) {
  test(`ordinary pattern ${index + 1} preserves outputs, options and ordering`, () => {
    for (const opts of options) {
      for (const method of ['create', 'compile', 'expand', 'stringify']) {
        assert.deepEqual(patched[method](pattern, opts), upstream('public', method, pattern, opts), `${method}: ${pattern}`);
      }
      assert.deepEqual(patched([pattern, '{z,y}'], opts), upstream('batch', 'call', pattern, opts));
      for (const method of ['compile', 'expand', 'stringify']) {
        assert.deepEqual(direct[method](patched.parse(pattern), opts), upstream('direct', method, pattern, opts));
      }
    }
  });
}

const nesting = (depth, kind = 'brace', balanced = true) => {
  const opens = Array.from({ length: depth }, (_, index) => kind === 'mixed' ? (index % 2 ? '(' : '{') : kind === 'paren' ? '(' : '{');
  return opens.join('') + 'x' + (balanced ? opens.reverse().map(value => value === '(' ? ')' : '}').join('') : '');
};
const controlled = action => assert.throws(action, error => error instanceof RangeError && error.code === 'ERR_BRACES_NESTING' && !/stack/i.test(error.message));
const arrayAt = depth => {
  let value = 'a';
  for (let index = 0; index < depth; index++) value = [value];
  return value;
};
const astAt = depth => {
  const root = { type: 'root', nodes: [] };
  let current = root;
  for (let index = 0; index < depth; index++) {
    const next = { type: 'paren', nodes: [], parent: current };
    current.nodes.push(next);
    current = next;
  }
  current.nodes.push({ type: 'text', value: 'a', parent: current });
  return root;
};

for (const kind of ['brace', 'paren', 'mixed']) {
  for (const balanced of [true, false]) {
    for (const depth of [99, 100]) {
      test(`${kind} depth ${depth}, balanced ${balanced}, preserves accepted behavior`, () => {
        const input = nesting(depth, kind, balanced);
        assert.equal(direct.parse(input).type, 'root');
        for (const method of ['compile', 'expand', 'stringify']) {
          assert.deepEqual(patched[method](input), upstream('public', method, input));
        }
      });
    }
    for (const depth of [101, 4999]) {
      test(`${kind} depth ${depth}, balanced ${balanced}, rejects before recursive processing`, () => {
        const input = nesting(depth, kind, balanced);
        controlled(() => direct.parse(input, { maxDepth: Infinity, depthLimit: false }));
        for (const method of ['compile', 'expand', 'stringify']) controlled(() => patched[method](input));
      });
    }
  }
}

for (const method of ['compile', 'expand', 'stringify']) {
  test(`${method} direct AST accepts 99/100 and rejects 101/4999`, () => {
    for (const depth of [99, 100]) assert.deepEqual(direct[method](astAt(depth)), method === 'expand' ? ['a'] : 'a');
    for (const depth of [101, 4999]) controlled(() => direct[method](astAt(depth)));
  });
  test(`${method} rejects child and parent cycles; permits shared nodes and normal backreferences`, () => {
    const childCycle = { type: 'root', nodes: [] };
    childCycle.nodes.push(childCycle);
    controlled(() => direct[method](childCycle));
    const parentCycle = astAt(1);
    parentCycle.nodes[0].parent = parentCycle.nodes[0];
    controlled(() => direct[method](parentCycle));
    const shared = { type: 'text', value: 'a' };
    const sharedRoot = { type: 'root', nodes: [shared, shared] };
    assert.deepEqual(direct[method](sharedRoot), method === 'expand' ? ['aa'] : 'aa');
    assert.deepEqual(direct[method](patched.parse('{a,{b,c}}')), upstream('direct', method, '{a,{b,c}}'));
  });
  test(`${method} rejects value/queue array depth and cycles, including ancestor queues`, () => {
    for (const field of ['value', 'queue']) {
      for (const depth of [101, 4999]) {
        const ast = astAt(0);
        ast.nodes[0][field] = arrayAt(depth);
        controlled(() => direct[method](ast));
      }
      const ast = astAt(0);
      const cycle = [];
      cycle.push(cycle);
      ast.nodes[0][field] = cycle;
      controlled(() => direct[method](ast));
    }
    const ast = astAt(1);
    ast.queue = arrayAt(4999);
    controlled(() => direct[method](ast.nodes[0]));
  });
  test(`${method} rejects an external parent chain beyond the fixed bound`, () => {
    const ast = astAt(0);
    let current = ast;
    for (let index = 0; index < 4999; index++) current = current.parent = { type: 'paren' };
    controlled(() => direct[method](ast));
  });
  test(`${method} rejects non-array child containers that bypass AST traversal`, () => {
    const ast = { type: 'root', nodes: new Set([astAt(4999)]) };
    controlled(() => direct[method](ast));
  });
}

test('array flatten and expansion preserve supported arrays and reject recursive arrays', () => {
  for (const depth of [99, 100]) {
    assert.deepEqual(flatten(arrayAt(depth)), ['a']);
    const ast = { type: 'root', nodes: [{ type: 'text', value: arrayAt(depth) }] };
    assert.deepEqual(direct.expand(ast), ['a']);
  }
  const shared = ['a', ['b']];
  assert.deepEqual(flatten([shared, shared]), ['a', 'b', 'a', 'b']);
  for (const depth of [101, 4999]) controlled(() => flatten(arrayAt(depth)));
  const cycle = []; cycle.push(cycle);
  controlled(() => flatten(cycle));
});

test('quotes, bracket literals and escaped delimiters do not count as parsed nesting', () => {
  for (const input of ['"' + '{'.repeat(4999) + '"', '[' + '('.repeat(4999) + ']', '\\{'.repeat(4999)]) {
    assert.deepEqual(patched.compile(input), upstream('public', 'compile', input));
  }
});

test('rejection does not poison later calls or change ordinary range errors', () => {
  controlled(() => patched.expand(nesting(4999)));
  assert.deepEqual(patched.expand('{a,b}'), ['a', 'b']);
  assert.throws(() => patched.expand('{1..1001}'), /range limit/);
  assert.deepEqual(patched.expand('{1..1001}', { rangeLimit: false }), upstream('public', 'expand', '{1..1001}', { rangeLimit: false }));
});
