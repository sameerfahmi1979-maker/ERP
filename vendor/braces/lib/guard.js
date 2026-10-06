'use strict';

// ALGT security patch: iterative validation before upstream recursive walkers.
// Parent/prev edges belong to the AST representation and are not traversal edges.
const MAX_DEPTH = 128;
const MAX_NODES = 131072;
function depthError() { return new SyntaxError('ALGT_BRACES_DEPTH_LIMIT: maximum nesting is 128'); }
function assertAst(root) {
  const pending = [{node:root, depth:0, exit:false}];
  const active = new Set();
  let count = 0;
  while (pending.length) {
    const {node, depth, exit} = pending.pop();
    if (exit) { active.delete(node); continue; }
    if (!node || typeof node !== 'object') throw new TypeError('Invalid braces AST node');
    if (depth > MAX_DEPTH) throw depthError();
    if (++count > MAX_NODES) throw new SyntaxError('ALGT_BRACES_NODE_LIMIT');
    if (active.has(node)) throw new SyntaxError('ALGT_BRACES_CYCLE');
    const ancestors = new Set();
    for (let parent=node.parent; parent; parent=parent.parent) {
      if (ancestors.has(parent)) throw new SyntaxError('ALGT_BRACES_PARENT_CYCLE');
      if (ancestors.size >= MAX_DEPTH) throw depthError();
      ancestors.add(parent);
    }
    active.add(node);
    pending.push({node, depth, exit:true});
    if (node.nodes) {
      if (!Array.isArray(node.nodes)) throw new TypeError('Invalid braces AST children');
      if (node.nodes.length > MAX_NODES || pending.length + node.nodes.length > MAX_NODES) {
        throw new SyntaxError('ALGT_BRACES_NODE_LIMIT');
      }
      for (let i=node.nodes.length-1; i>=0; i--) {
        pending.push({node:node.nodes[i], depth:depth+1, exit:false});
      }
    }
  }
}
module.exports = {MAX_DEPTH, depthError, assertAst};
