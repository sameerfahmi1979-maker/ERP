'use strict';
// Read-only source triage. Positive syntax evidence is not a purity or runtime proof.
const fs = process.getBuiltinModule('fs');
const path = process.getBuiltinModule('path');
const crypto = process.getBuiltinModule('crypto');
const ts = process.getBuiltinModule('module').createRequire(__filename)('typescript');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');

function classifyDeclaration(declaration) {
  if (!declaration) return {kind:'UNRESOLVED_EXPORT', calls:[], reasons:['No local declaration resolved']};
  if (ts.isInterfaceDeclaration(declaration) || ts.isTypeAliasDeclaration(declaration)) {
    return {kind:'TYPE_ONLY_EXPORT', calls:[], reasons:[]};
  }
  const source = declaration.getSourceFile();
  const calls = [];
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      const method = ts.isPropertyAccessExpression(expression) ? expression.name.text : '';
      let kind = 'DELEGATED_OR_EXTERNAL_CALL';
      // Keep syntax-only labels: e.g. Map.delete is not a proven database write.
      if (['insert','update','upsert','delete','remove','upload'].includes(method)) kind = 'WRITE_NAMED_CALL';
      else if (method === 'rpc') kind = 'RPC_EFFECT_UNRESOLVED';
      else if (method === 'select') kind = 'SELECT_NAMED_CALL';
      else if (ts.isIdentifier(expression) && ['fetch','eval'].includes(expression.text)) kind = 'DYNAMIC_OR_HTTP_EFFECT_UNRESOLVED';
      calls.push({expression:expression.getText(source), line:source.getLineAndCharacterOfPosition(node.getStart(source)).line+1, kind});
    }
    ts.forEachChild(node, visit);
  }
  visit(declaration);
  const writes = calls.some(call=>call.kind==='WRITE_NAMED_CALL');
  const reads = calls.some(call=>call.kind==='SELECT_NAMED_CALL');
  const unresolved = calls.some(call=>call.kind.endsWith('UNRESOLVED') || call.kind==='DELEGATED_OR_EXTERNAL_CALL');
  return {
    kind:writes ? (reads?'MIXED_READ_WRITE_SYNTAX':'WRITE_SYNTAX') : reads?'READ_SYNTAX_NOT_PURITY_PROOF':calls.length?'DELEGATED_EFFECT_REVIEW':'NO_DIRECT_CALL_SYNTAX',
    calls,
    reasons:unresolved?['Delegated, RPC or external effects require review; absence of write syntax does not prove read-only behavior.']:[],
  };
}

function reviewExports(root, register) {
  const config = ts.readConfigFile(path.join(root,'tsconfig.shipping.json'),ts.sys.readFile);
  if (config.error) throw Error('Cannot read source configuration');
  const parsed = ts.parseJsonConfigFileContent(config.config,ts.sys,root);
  if (parsed.errors.length) throw Error('Invalid source configuration');
  const program = ts.createProgram(parsed.fileNames,parsed.options);
  const checker = program.getTypeChecker();
  const references = new Map();
  for (const row of register.rows) {
    for (const ref of row.semanticDiscovery?.actionReferences??[]) {
      const key = ref.module+'#'+ref.symbol;
      if (!references.has(key)) references.set(key,{module:ref.module,symbol:ref.symbol,consumers:[]});
      references.get(key).consumers.push({id:row.id,file:row.file,line:ref.line});
    }
  }
  const entries = [];
  for (const [key, ref] of [...references].sort(([a],[b])=>a.localeCompare(b))) {
    const relative = path.relative(root,path.resolve(root,ref.module));
    if (path.isAbsolute(ref.module) || relative.startsWith('..') || !ref.module.startsWith('src/')) throw Error('Unsafe source reference');
    const source = program.getSourceFile(path.join(root,ref.module));
    if (source && digest(fs.readFileSync(source.fileName)) !== register.rows.find(row=>row.file===ref.module)?.sourceSha256) throw Error('Inventory source drift: '+ref.module);
    const moduleSymbol = source && checker.getSymbolAtLocation(source);
    let symbol = moduleSymbol && checker.getExportsOfModule(moduleSymbol).find(value=>value.name===ref.symbol);
    if (symbol && (symbol.flags & ts.SymbolFlags.Alias)) symbol = checker.getAliasedSymbol(symbol);
    const declaration = symbol?.valueDeclaration ?? symbol?.declarations?.[0];
    const declarationFile = declaration && path.relative(root,declaration.getSourceFile().fileName).replaceAll('\\','/');
    const localDeclaration = declarationFile?.startsWith('src/') ? declaration : undefined;
    const analysis = classifyDeclaration(localDeclaration);
    entries.push({key,...ref,sourceSha256:source?digest(fs.readFileSync(source.fileName)):null,
      declarationFile:declarationFile??null,
      declarationSha256:localDeclaration?digest(fs.readFileSync(localDeclaration.getSourceFile().fileName)):null,
      declarationLine:localDeclaration?localDeclaration.getSourceFile().getLineAndCharacterOfPosition(localDeclaration.getStart()).line+1:null,
      ...analysis,
      status:analysis.kind==='TYPE_ONLY_EXPORT'?'TYPE_REFERENCE_NOT_EXECUTABLE_ACTION':'CALLEE_EFFECT_REVIEW_OPEN',
    });
  }
  return {at:new Date().toISOString(),qualification:'SOURCE_BOUND_EXPORT_TRIAGE_NOT_MANUAL_EFFECT_REVIEW_OR_RUNTIME_ACCEPTANCE',
    counts:{exports:entries.length,typeOnly:entries.filter(e=>e.kind==='TYPE_ONLY_EXPORT').length,open:entries.filter(e=>e.status==='CALLEE_EFFECT_REVIEW_OPEN').length},
    entries};
}
module.exports={classifyDeclaration,reviewExports};
if(require.main===module) {
  const [root, input, output] = process.argv.slice(2);
  if (![root,input,output].every(value=>value && path.isAbsolute(value))) throw Error('Absolute root, input and output paths required');
  if(fs.existsSync(output)) throw Error('Refusing to overwrite review evidence');
  const result=reviewExports(root,JSON.parse(fs.readFileSync(input,'utf8')));
  fs.writeFileSync(output,JSON.stringify(result,null,2),{flag:'wx'});
  console.log(JSON.stringify(result.counts));
}
