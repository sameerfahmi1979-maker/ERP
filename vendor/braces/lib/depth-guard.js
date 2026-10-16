'use strict';

// ALGT local mitigation for GHSA-vfj7-8cjw-p6xm. Fixed, non-configurable:
// callers cannot remove the bound by passing an option.
const MAX_DEPTH = 100;
const reject = () => {
  const error = new RangeError('braces nesting exceeds the fixed limit of 100 or contains a cycle');
  error.code = 'ERR_BRACES_NESTING';
  throw error;
};

const assertArrays = value => {
  const active = new WeakSet();
  const stack = [{ value, depth: 0, exit: false }];
  while (stack.length) {
    const frame = stack.pop();
    if (!Array.isArray(frame.value)) continue;
    if (frame.exit) {
      active.delete(frame.value);
      continue;
    }
    const depth = frame.depth + 1;
    if (depth > MAX_DEPTH || active.has(frame.value)) reject();
    active.add(frame.value);
    stack.push({ value: frame.value, depth, exit: true });
    for (let index = frame.value.length - 1; index >= 0; index--) {
      stack.push({ value: frame.value[index], depth, exit: false });
    }
  }
};

const assertParents = node => {
  const seen = new WeakSet();
  let current = node;
  let count = 0;
  while (current && typeof current === 'object') {
    if (seen.has(current) || count++ > MAX_DEPTH + 1) reject();
    seen.add(current);
    assertArrays(current.value);
    assertArrays(current.queue);
    current = current.parent;
  }
};

const assertAst = ast => {
  const active = new WeakSet();
  const stack = [{ node: ast, depth: 0, first: true, exit: false }];
  while (stack.length) {
    const frame = stack.pop();
    const node = frame.node;
    if (!node || typeof node !== 'object') continue;
    if (frame.exit) {
      active.delete(node);
      continue;
    }
    if (node.nodes && !Array.isArray(node.nodes)) reject();
    const depth = frame.depth + (node.nodes && !(frame.first && node.type === 'root') ? 1 : 0);
    if (depth > MAX_DEPTH || active.has(node)) reject();
    active.add(node);
    assertParents(node);
    stack.push({ node, depth, first: false, exit: true });
    if (Array.isArray(node.nodes)) {
      for (let index = node.nodes.length - 1; index >= 0; index--) {
        stack.push({ node: node.nodes[index], depth, first: false, exit: false });
      }
    }
  }
};

module.exports = { MAX_DEPTH, reject, assertArrays, assertParents, assertAst };
