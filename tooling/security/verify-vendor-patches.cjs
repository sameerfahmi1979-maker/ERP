'use strict';
const fs = process.getBuiltinModule('fs');
const path = process.getBuiltinModule('path');
const crypto = process.getBuiltinModule('crypto');
const root = path.resolve(__dirname, '../..');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const manifest = JSON.parse(fs.readFileSync(path.join(root,'vendor/PATCH-MANIFEST.json'),'utf8'));
const actual = [];
function walk(relative) {
  for(const entry of fs.readdirSync(path.join(root,relative),{withFileTypes:true})) {
    const file = relative+'/'+entry.name;
    if(entry.isSymbolicLink()) throw Error('Vendor source must not be a symlink');
    if(entry.isDirectory()) walk(file); else actual.push(file);
  }
}
for(const name of ['braces','sprintf-js']) walk('vendor/'+name);
if(JSON.stringify(actual.sort()) !== JSON.stringify(Object.keys(manifest.patchedFiles).sort())) throw Error('Unexpected or missing vendor file');
for(const [file,expected] of Object.entries(manifest.patchedFiles)) {
  if(digest(fs.readFileSync(path.join(root,file))) !== expected) throw Error('Vendor patch integrity mismatch: '+file);
}
const fromRoot = process.getBuiltinModule('module').createRequire(path.join(root,'package.json'));
for(const [name,caller] of [['braces','micromatch'],['sprintf-js','mammoth/node_modules/argparse']]) {
  const expected = fs.realpathSync(fromRoot.resolve(name));
  if(!expected.startsWith(path.join(root,'vendor',name)+path.sep)) throw Error('Unpatched root resolution: '+name);
  const fromCaller = process.getBuiltinModule('module').createRequire(fromRoot.resolve(caller));
  if(fs.realpathSync(fromCaller.resolve(name)) !== expected) throw Error('Unpatched nested resolution: '+name);
}
const lock = JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8'));
for(const [key,value] of Object.entries(lock.packages)) {
  for(const name of ['braces','sprintf-js']) {
    if(key.endsWith('/node_modules/'+name) || key==='node_modules/'+name) {
      if(value.resolved !== 'vendor/'+name || value.link !== true) throw Error('Registry copy remains: '+key);
    }
  }
}
console.log(JSON.stringify({verifiedVendorFiles:actual.length,installedResolution:'patched root and nested consumers',upstreamAuditIsNotPatchVerification:true}));
