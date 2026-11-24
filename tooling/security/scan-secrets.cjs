'use strict';
// Current Git tree/index only. Outputs locations/categories, never matched text.
const fs = process.getBuiltinModule('node:fs');
const path = process.getBuiltinModule('node:path');
const cp = process.getBuiltinModule('node:child_process');
const root = path.resolve(__dirname, '../..');
const git = args => cp.execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:24*1024*1024});
const placeholder = value => /^(?:synthetic|test[-_]|local[-_]|placeholder|paste_|your[-_]|replace|\[REDACTED|<)/i.test(value);

function hasPrivateKeyMaterial(text, offset) {
  // A format marker alone is public syntax. Require 24 bytes' worth of nearby
  // base64 material, even if truncated or missing its END marker. This is not
  // a crypto parser: malformed/partial private material must still be caught.
  const horizontal = /[ \t]*/y;
  const newline = /(?:\r\n|[\r\n]|\\+(?:r\\+n|[nr])|`(?:r`n|[nr]))/y;
  const metadata = /(?:Proc-Type:[ \t]*4,[ \t]*ENCRYPTED|DEK-Info:[ \t]*[A-Z0-9-]+,[A-Fa-f0-9]+)/y;
  const base64 = /([A-Za-z0-9+/]+)={0,2}/y;
  let materialLength = 0;
  const take = pattern => {
    pattern.lastIndex = offset;
    const match = pattern.exec(text);
    if(match) offset = pattern.lastIndex;
    return match;
  };
  while(offset < text.length) {
    take(horizontal);
    // Match real and JSON-escaped line endings in place, keeping source offsets
    // intact. Never skip quotes/operators to reach unrelated text or literals.
    if(take(newline)) continue;
    if(!materialLength && take(metadata)) {
      take(horizontal);
      if(!take(newline)) return false;
      continue;
    }
    const body = take(base64);
    if(!body) return false;
    materialLength += body[1].length;
    if(materialLength >= 32) return true;
    take(horizontal);
    if(!take(newline)) return false;
  }
  return false;
}

function hasCompleteAssembledPrivateKey(text, index, header, label) {
  // Only this complete-body path accepts spaces within base64 and literal
  // assembly. A matching footer and a fixed grammar disambiguate public format
  // markers from actual material, without evaluating any scanned source.
  const candidate = text.slice(index + header.length, index + header.length + 65536);
  const footer = '-----END ' + label + '-----';
  const end = candidate.indexOf(footer);
  if(end < 0) return false;
  const source = candidate.slice(0,end);
  const openingQuote = text[index - 1];
  let quote = /["'`]/.test(openingQuote || '') ? openingQuote : undefined;
  let assembly;
  let fragments = 1;
  let body = '';
  for(let offset = 0; offset < source.length;) {
    if(quote && source[offset] === quote) {
      const seam = /^(?:["'`])\s*([+,])\s*(["'`])/.exec(source.slice(offset));
      if(!seam || (assembly && assembly !== seam[1]) || ++fragments > 256) return false;
      assembly = seam[1];
      quote = seam[2];
      body += assembly === ',' ? '\n' : '';
      offset += seam[0].length;
    } else {
      body += source[offset++];
    }
  }
  const escapedNewlines = /\\+(?:r\\+n|[nr])|`(?:r`n|[nr])/g;
  if(quote) {
    const tail = candidate.slice(end + footer.length).replace(escapedNewlines,'\n').trimStart();
    if(!tail.startsWith(quote)) return false;
    if(assembly === ',') {
      // Complete literal arrays expose the private bytes even without .join().
      // Require actual array brackets, never unrelated fields or arguments.
      if(!text.slice(Math.max(0,index - 256),index - 1).trimEnd().endsWith('[')) return false;
      let arrayTail = tail.slice(1).trimStart();
      for(;;) {
        const emptyLine = /^,\s*(["'`])[ \t\r\n]*\1/.exec(arrayTail);
        if(!emptyLine) break;
        if(++fragments > 256) return false;
        arrayTail = arrayTail.slice(emptyLine[0].length).trimStart();
      }
      if(!/^,?\s*\]/.test(arrayTail)) return false;
    }
  }
  body = body.replace(escapedNewlines,'\n');
  // Legacy encrypted PEM metadata is public; only the following body counts.
  for(let headers = 0; headers < 2; headers++) {
    const metadata = /^\s*(?:Proc-Type:[ \t]*4,[ \t]*ENCRYPTED|DEK-Info:[ \t]*[A-Z0-9-]+,[A-Fa-f0-9]+)[ \t]*(?:\r\n|[\r\n])/.exec(body);
    if(!metadata) break;
    body = body.slice(metadata[0].length);
  }
  const material = body.replace(/[ \t\r\n]/g,'');
  return /^[A-Za-z0-9+/]+={0,2}$/.test(material) && material.replace(/=/g,'').length >= 32;
}

function findSecrets(text, exact = []) {
  const hits = [];
  const add = (index, category) => hits.push({line:text.slice(0,index).split('\n').length,category});
  for (const {name,value} of exact) {
    if(value.length < 12 || placeholder(value)) continue;
    let offset = -1;
    while((offset = text.indexOf(value,offset+1)) !== -1) add(offset,name);
  }
  const patterns = [
    ['PROVIDER_KEY', /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{30,}/g],
    ['GITHUB_TOKEN', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/g],
    ['SUPABASE_SECRET', /\bsb_secret_[A-Za-z0-9_-]{20,}/g],
    ['ZHIPU_KEY', /\b[a-f0-9]{32}\.[A-Za-z0-9]{16,}\b/g],
  ];
  for (const [name,pattern] of patterns) for(const m of text.matchAll(pattern)) add(m.index,name);
  for(const m of text.matchAll(/-----BEGIN ((?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY)-----/g)) {
    if(hasPrivateKeyMaterial(text, m.index + m[0].length) || hasCompleteAssembledPrivateKey(text,m.index,m[0],m[1])) add(m.index,'PRIVATE_KEY');
  }
  for(const m of text.matchAll(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)) {
    try { if(JSON.parse(Buffer.from(m[0].split('.')[1],'base64url').toString()).role==='service_role') add(m.index,'SERVICE_ROLE_JWT'); } catch {}
  }
  // Shared secrets are not necessarily recognisable vendor tokens.
  for(const m of text.matchAll(/(?:INTERNAL_API_SECRET|PDF_PRINT_TOKEN_SECRET|DMS_SCHEDULER_SECRET|SUPABASE_SERVICE_ROLE_KEY|ZHIPU_API_KEY|\$ApiKey)\s*[:=]\s*["']([^"'\r\n]{16,})["']/g)) {
    if(!placeholder(m[1]) && !/^(?:\$|process\.env)/.test(m[1])) add(m.index,'LITERAL_SHARED_SECRET');
  }
  return hits;
}
function main() {
  const staged = process.argv.includes('--staged');
  const index = staged || process.argv.includes('--index');
  if(process.argv.slice(2).some(a=>!['--staged','--index'].includes(a)) || process.argv.length>3) throw Error('Use at most one of --staged or --index');
  const files = git(staged ? ['diff','--cached','--name-only','--diff-filter=ACMR','-z'] : ['ls-files','-z']).split('\0').filter(Boolean);
  const exact=[];
  const envFile=path.join(root,'.env.local');
  if(fs.existsSync(envFile)) for(const line of fs.readFileSync(envFile,'utf8').split(/\r?\n/)) {
    const m=line.match(/^([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if(m && !m[1].startsWith('NEXT_PUBLIC_') && /SECRET|PASSWORD|API_KEY|SERVICE_ROLE_KEY|TOKEN/.test(m[1])) exact.push({name:m[1],value:m[2].replace(/^(["'])(.*)\1$/,'$2')});
  }
  const findings=[];
  for(const file of files) {
    if(!/\.(?:md|mdc|txt|json|ya?ml|toml|sql|[cm]?js|[cm]?tsx?|ps1|psm1|example)$/i.test(file)) continue;
    const filename=path.join(root,file);
    if(!index&&!fs.existsSync(filename)) continue;
    const content=index?git(['show',':'+file]):fs.readFileSync(filename,'utf8');
    const hits=findSecrets(content,exact);
    if(hits.length) findings.push({file,hits});
  }
  console.log(JSON.stringify({scope:staged?'staged changes':index?'entire proposed Git index':'current tracked text',files:files.length,matching_files:findings.length,findings},null,2));
  if(findings.length) process.exitCode=1;
}
module.exports={findSecrets};
if(require.main===module) main();
