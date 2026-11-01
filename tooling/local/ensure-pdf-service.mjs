import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

// Existing reviewed local renderer image. Never pull a moving tag on startup.
export const LOCAL_PDF_IMAGE='sha256:f29984bd1e226bf1b93ba90af06000afa8b315853e99d27b9aaa41b93f15c769';
const COMMAND=['gotenberg','--api-timeout=30s','--chromium-deny-list=^https?://.*'];
const ROLE='net.algt.erp.local-role';
const INSPECT='{"image":{{json .Image}},"cmd":{{json .Config.Cmd}},"ports":{{json .HostConfig.PortBindings}},"mounts":{{json .Mounts}},"running":{{json .State.Running}},"labels":{{json .Config.Labels}},"publishAll":{{json .HostConfig.PublishAllPorts}}}';
const exec=promisify(execFile);

export function localRendererTarget(value){
  let url;
  try{url=new URL(value||'http://localhost:3100');}catch{throw Error('Set GOTENBERG_URL to a valid local PDF-service address.');}
  if(url.protocol!=='http:'||!['localhost','127.0.0.1'].includes(url.hostname)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)
    throw Error('Automatic PDF startup accepts only a loopback HTTP origin. Production renderer settings must not be used here.');
  const port=Number(url.port||80);
  if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Use a local PDF-service port between 1024 and 65535.');
  return {port,origin:`http://127.0.0.1:${port}`};
}

function localDockerHost(host){
  return /^npipe:\/\/\/\/\.\/pipe\/docker(?:DesktopLinuxEngine|_engine)$/.test(host)||host.startsWith('unix:///');
}

export function validRendererContainer(container,port,managed){
  const bindings=container?.ports?.['3000/tcp'];
  return container?.image===LOCAL_PDF_IMAGE&&JSON.stringify(container.cmd)===JSON.stringify(COMMAND)&&
    Array.isArray(container.mounts)&&container.mounts.length===0&&!container.publishAll&&
    Object.keys(container.ports??{}).length===1&&Array.isArray(bindings)&&bindings.length===1&&
    bindings[0].HostIp==='127.0.0.1'&&bindings[0].HostPort===String(port)&&
    (!managed||container.labels?.[ROLE]==='pdf-renderer');
}

async function runDocker(args,timeout=10000){
  try{const result=await exec('docker',args,{windowsHide:true,encoding:'utf8',timeout,maxBuffer:1024*1024});return {ok:true,stdout:result.stdout.trim()};}
  catch(error){return {ok:false,stdout:'',missing:error.code==='ENOENT'};}
}

/** Local development dependency only. Never resets Docker, changes contexts,
 * rewrites env files, touches a database, pulls images, or changes production. */
export async function ensureLocalPdfService({env=process.env,platform=process.platform,run=runDocker,fetcher=fetch,
  sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),now=Date.now,log=console.log}={}){
  if(env.NODE_ENV==='production')throw Error('Automatic PDF startup is for npm run dev only; it cannot manage production.');
  const target=localRendererTarget(env.GOTENBERG_URL);
  if(env.DOCKER_HOST&&!localDockerHost(env.DOCKER_HOST))throw Error('Docker points outside this computer. Select your local Docker Desktop context yourself.');
  const context=await run(['context','inspect','--format','{{.Endpoints.docker.Host}}']);
  if(context.missing)throw Error('Docker Desktop is not installed or docker is not on PATH. Install/start Docker Desktop normally, then retry npm run dev.');
  if(!context.ok||!localDockerHost(context.stdout))throw Error('Cannot verify a local Docker context. Select the local Docker Desktop context, then retry.');
  const engine=()=>run(['version','--format','{{.Server.Os}}'],4000);
  let ready=await engine();
  if(!ready.ok){
    if(!['win32','darwin'].includes(platform))throw Error('Start your local Docker engine, then retry npm run dev.');
    log('[Local PDF] Starting Docker Desktop…');
    const start=await run(['desktop','start','--detach'],15000);
    if(!start.ok)throw Error('Docker Desktop could not start automatically. Start it normally, accept any setup prompts there, then retry npm run dev.');
    const deadline=now()+90000;
    while(!ready.ok&&now()<deadline){await sleep(1500);ready=await engine();}
  }
  if(!ready.ok)throw Error('Docker did not become ready within 90 seconds. Check Docker Desktop, then retry npm run dev.');
  if(ready.stdout!=='linux')throw Error('The PDF service requires Docker Linux containers. Switch Docker Desktop to Linux containers yourself, then retry.');
  const managedName=`algt-erp-local-pdf-${target.port}`;
  const inspect=async name=>{
    const result=await run(['container','inspect',name,'--format',INSPECT]);
    if(!result.ok)return null;
    try{return JSON.parse(result.stdout);}catch{throw Error('Local PDF-container configuration could not be read safely. No container was changed.');}
  };
  let name=managedName,container=await inspect(managedName),managed=true;
  if(!container&&target.port===16430){
    const legacy=await inspect('algt-f00-renderer');
    if(legacy){name='algt-f00-renderer';container=legacy;managed=false;}
  }
  if(container&&!validRendererContainer(container,target.port,managed))throw Error('The existing local PDF container has unexpected configuration. No container was replaced or changed; ask for a configuration review.');
  if(!container){
    const image=await run(['image','inspect',LOCAL_PDF_IMAGE,'--format','{{.Id}}']);
    if(!image.ok||image.stdout!==LOCAL_PDF_IMAGE)throw Error('The reviewed local PDF image is missing. Restore the reviewed image before retrying; startup will not download an unreviewed replacement.');
    log('[Local PDF] Creating the loopback-only PDF service…');
    const created=await run(['run','--detach','--pull=never','--name',managedName,'--label',`${ROLE}=pdf-renderer`,
      '--publish',`127.0.0.1:${target.port}:3000`,'--memory','1g','--cpus','2','--pids-limit','512',LOCAL_PDF_IMAGE,...COMMAND],20000);
    container=await inspect(managedName);
    // Another simultaneous npm start may have created the same owned container.
    if(!container||!validRendererContainer(container,target.port,true))throw Error('The local PDF container could not be created with the reviewed settings. Check Docker/port availability; nothing was deleted.');
    if(!created.ok&&!container.running)throw Error('The local PDF service could not bind its port. Close the conflicting service or choose another local renderer port.');
  }
  if(!container.running){
    log('[Local PDF] Starting the existing PDF service…');
    const started=await run(['start',name]);
    if(!started.ok)throw Error('The local PDF container could not start. Check Docker Desktop and the configured local port; no container was removed.');
  }
  const deadline=now()+30000;
  do{
    try{
      const response=await fetcher(`${target.origin}/health`,{signal:AbortSignal.timeout(2000),cache:'no-store'});
      await response.body?.cancel();
      if(response.ok){log(`[Local PDF] Ready at ${target.origin}.`);return {origin:target.origin,container:name};}
    }catch{/* Retry only within the bounded local startup window. */}
    await sleep(750);
  }while(now()<deadline);
  throw Error('The local PDF service did not become healthy within 30 seconds. The ERP was not started; inspect the local renderer before retrying.');
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const {default:nextEnv}=await import('@next/env');
    nextEnv.loadEnvConfig(process.cwd(),true,{info(){},error(){}});
    await ensureLocalPdfService();
  }catch(error){console.error(`[Local PDF] ${error instanceof Error?error.message:'Local service startup failed.'}`);process.exitCode=1;}
}
