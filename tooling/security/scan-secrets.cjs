'use strict';
// Current Git tree/index only. Outputs locations/categories, never matched text.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const git = args => cp.execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:24*1024*1024});
const placeholder = value => /^(?:synthetic|test[-_]|local[-_]|placeholder|paste_|your[-_]|replace|\[REDACTED|<)/i.test(value);
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
    ['PRIVATE_KEY', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
    ['ZHIPU_KEY', /\b[a-f0-9]{32}\.[A-Za-z0-9]{16,}\b/g],
  ];
  for (const [name,pattern] of patterns) for(const m of text.matchAll(pattern)) add(m.index,name);
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
