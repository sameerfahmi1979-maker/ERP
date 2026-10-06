'use strict';

// Additive discovery labels only. Never modify acceptance or infer authorization.
function hasRuntimeImport(ts, node) {
  const clause = node.importClause;
  if (!clause) return true;
  if (clause.isTypeOnly) return false;
  if (clause.name) return true;
  return !clause.namedBindings || !ts.isNamedImports(clause.namedBindings) || clause.namedBindings.elements.some(element => !element.isTypeOnly);
}
function hasRuntimeExport(ts, node) {
  return !node.isTypeOnly && (!node.exportClause || !ts.isNamedExports(node.exportClause) || node.exportClause.elements.some(element => !element.isTypeOnly));
}
function classifySource(ts, ast, file, resolveModule, reviewedActions = {}) {
  const shadowed = new Set();
  const named = new Map();
  const namespaces = new Map();
  const signals = [];
  const actionReferences = [];
  let unresolvedDynamicImport = false;
  function declaration(node) {
    if ((ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isBindingElement(node) || ts.isClassDeclaration(node) || ts.isFunctionDeclaration(node) || ts.isImportClause(node) || ts.isImportSpecifier(node) || ts.isNamespaceImport(node)) && node.name && ts.isIdentifier(node.name)) shadowed.add(node.name.text);
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && hasRuntimeImport(ts, node)) {
      const resolvedModule = resolveModule(node.moduleSpecifier.text);
      const bindings = node.importClause?.namedBindings;
      if (resolvedModule && bindings && ts.isNamedImports(bindings)) for (const element of bindings.elements) {
        if (!element.isTypeOnly) named.set(element.name.text, {module:resolvedModule, symbol: element.propertyName?.text ?? element.name.text});
      }
      if (resolvedModule && bindings && ts.isNamespaceImport(bindings)) namespaces.set(bindings.name.text, resolvedModule);
    }
    ts.forEachChild(node, declaration);
  }
  declaration(ast);
  function action(reference, node) {
    if (!reference.module.startsWith('src/server/actions/')) return;
    const key = reference.module + '#' + reference.symbol;
    // Caller supplies only source-hash-verified exact module/export decisions.
    const classification = reviewedActions[key] ?? 'ACTION_REQUIRES_CALLEE_REVIEW';
    actionReferences.push({...reference, line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1, classification});
  }
  function insideImport(node) {
    for (let parent = node.parent; parent; parent = parent.parent) if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent) || ts.isTypeNode(parent)) return true;
    return false;
  }
  function visit(node) {
    if (ts.isIdentifier(node) && named.has(node.text) && !insideImport(node) && !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node)) action(named.get(node.text), node);
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && namespaces.has(node.expression.text)) action({module: namespaces.get(node.expression.text), symbol: node.name.text}, node);
    if (ts.isCallExpression(node)) {
      const expression = node.expression.getText(ast);
      let kind;
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword && (!node.arguments[0] || !ts.isStringLiteral(node.arguments[0]))) unresolvedDynamicImport = true;
      if (/^(Array|Buffer)\.from$/.test(expression) && !shadowed.has(expression.split('.')[0])) kind = 'NON_DATABASE_CONSTRUCTOR';
      else if (/^(useQuery|useInfiniteQuery)$/.test(expression)) kind = 'QUERY_HOOK';
      else if (/^(fetch|globalThis\.fetch)$/.test(expression)) kind = 'FETCH_TRANSPORT_CANDIDATE';
      else if (/(^|\.)(refetch|invalidateQueries|refresh)$/.test(expression)) kind = 'READ_LIFECYCLE_CONTROL';
      else if (/\.(from|rpc|select|range|insert|update|upsert|delete)$/.test(expression)) {
        const methods = [];
        let chain = node;
        while (chain.parent && ts.isPropertyAccessExpression(chain.parent) && chain.parent.expression === chain && chain.parent.parent && ts.isCallExpression(chain.parent.parent)) chain = chain.parent.parent;
        function walkChain(part) {
          if (!ts.isCallExpression(part) || !ts.isPropertyAccessExpression(part.expression)) return;
          methods.push(part.expression.name.text);walkChain(part.expression.expression);
        }
        walkChain(chain);
        kind = methods.some(method => ['insert','update','upsert','delete'].includes(method)) ? 'MUTATION_CHAIN_INCLUDING_RETURNED_ROWS' : methods.includes('rpc') ? 'RPC_REQUIRES_SEMANTIC_REVIEW' : methods.includes('select') ? 'DATABASE_READ_CHAIN_CANDIDATE' : 'DATA_CALL_REQUIRES_SEMANTIC_REVIEW';
      }
      if (kind) signals.push({expression,line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1,kind});
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  const role = /(^|\/)(__tests__|tests)\/|\.(test|spec)\.[cm]?[jt]sx?$/.test(file) ? 'TEST_ONLY_SOURCE'
    : file.startsWith('src/app/api/') ? 'HTTP_ENTRYPOINT'
    : /src\/app\/(?:.*\/)?page\.[jt]sx?$/.test(file) ? 'PAGE_ENTRYPOINT'
    : file.startsWith('src/server/reads/') ? 'READ_SERVICE_IMPLEMENTATION'
    : file.startsWith('src/server/actions/') ? 'ACTION_SERVICE_REQUIRES_EXPORT_REVIEW'
    : file.startsWith('src/hooks/') ? 'HOOK_OR_READ_ADAPTER'
    : file.startsWith('src/lib/reads/') && /schema/.test(file) ? 'READ_SCHEMA_SUPPORT'
    : /\.tsx$/.test(file) ? 'UI_COMPONENT_CANDIDATE' : 'SHARED_SUPPORT_OR_SERVICE';
  return {role,signals,actionReferences,unresolvedDynamicImport,qualification:'STATIC_DISCOVERY_NOT_EXECUTION_OR_ACCEPTANCE'};
}
module.exports = {hasRuntimeImport,hasRuntimeExport,classifySource};
