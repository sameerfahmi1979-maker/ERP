'use strict';
const fs=process.getBuiltinModule('fs'),path=process.getBuiltinModule('path'),crypto=process.getBuiltinModule('crypto');

/** A read-consumer graph contains src files, but acceptance also depends on
 * tests/migrations. Verify their real hashes; missing/unsafe paths fail closed. */
function overlaySourcesAreCurrent(root,overlay,sourceSha256){
 if(overlay.sourceSha256!==sourceSha256)return false;
 try{
  const resolvedRoot=fs.realpathSync(root);
  for(const[file,hash]of Object.entries(overlay.acceptanceDependencies??{})){
   if(!/^[a-f0-9]{64}$/.test(hash)||path.isAbsolute(file)||path.win32.isAbsolute(file))return false;
   const target=path.resolve(resolvedRoot,file),relative=path.relative(resolvedRoot,target);
   if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))return false;
   const real=fs.realpathSync(target),realRelative=path.relative(resolvedRoot,real);
   if(realRelative==='..'||realRelative.startsWith('..'+path.sep)||path.isAbsolute(realRelative)||!fs.statSync(real).isFile())return false;
   if(crypto.createHash('sha256').update(fs.readFileSync(real)).digest('hex')!==hash)return false;
  }
  return true;
 }catch{return false;}
}
module.exports={overlaySourcesAreCurrent};
