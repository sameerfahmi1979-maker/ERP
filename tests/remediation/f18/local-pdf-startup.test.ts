import {expect,it,vi} from 'vitest';
import fs from 'node:fs';
import {ensureLocalPdfService,localRendererTarget,validRendererContainer,LOCAL_PDF_IMAGE} from '../../../tooling/local/ensure-pdf-service.mjs';

const safe=(managed=false)=>({image:LOCAL_PDF_IMAGE,cmd:['gotenberg','--api-timeout=30s','--chromium-deny-list=^https?://.*'],
 ports:{'3000/tcp':[{HostIp:'127.0.0.1',HostPort:'16430'}]},mounts:[],running:true,publishAll:false,
 labels:managed?{'net.algt.erp.local-role':'pdf-renderer'}:{}});
function harness(){
 const state={time:0,engine:true,desktopStart:true,neverReady:false,image:true,start:true,create:true,containers:{'algt-f00-renderer':safe()} as Record<string,ReturnType<typeof safe>>};
 const run=vi.fn(async(args:string[])=>{
  if(args[0]==='context')return {ok:true,stdout:'npipe:////./pipe/dockerDesktopLinuxEngine'};
  if(args[0]==='version')return {ok:state.engine&&!state.neverReady,stdout:state.engine?'linux':''};
  if(args[0]==='desktop'){if(state.desktopStart)state.engine=true;return {ok:state.desktopStart,stdout:''};}
  if(args[0]==='container'){const c=state.containers[args[2]];return {ok:!!c,stdout:c?JSON.stringify(c):''};}
  if(args[0]==='image')return {ok:state.image,stdout:state.image?LOCAL_PDF_IMAGE:''};
  if(args[0]==='start'){const c=state.containers[args[1]];if(c&&state.start)c.running=true;return {ok:state.start,stdout:''};}
  if(args[0]==='run'){
   const name=args[args.indexOf('--name')+1],binding=args[args.indexOf('--publish')+1],port=binding.split(':')[1];
   state.containers[name]={...safe(true),ports:{'3000/tcp':[{HostIp:'127.0.0.1',HostPort:port}]}};
   return {ok:state.create,stdout:''};
  }
  throw Error('Unexpected test command');
 });
 const fetcher=vi.fn(async()=>new Response('ok',{status:200}));
 const log=vi.fn();
 const options={env:{GOTENBERG_URL:'http://127.0.0.1:16430'},platform:'win32' as const,run,fetcher,sleep:async(ms:number)=>{state.time+=ms;},now:()=>state.time,log};
 return {state,run,fetcher,log,options};
}
it('accepts the configured loopback renderer and the existing example port',()=>{
 expect(localRendererTarget('http://localhost:16430')).toEqual({port:16430,origin:'http://127.0.0.1:16430'});
 expect(localRendererTarget(undefined).port).toBe(3100);
});
it.each(['https://erp.algt.net','http://192.168.1.1:3100','https://localhost:3100','http://localhost:3100/secret','http://user:password@localhost:3100','http://localhost:3100/?token=PRIVATE','http://localhost:80','not-a-url'])('rejects unsafe renderer configuration %s',value=>{
 expect(()=>localRendererTarget(value)).toThrow();
});
it('does not access Docker at all in production',async()=>{
 const h=harness();await expect(ensureLocalPdfService({...h.options,env:{...h.options.env,NODE_ENV:'production'}})).rejects.toThrow('production');expect(h.run).not.toHaveBeenCalled();
});
it('rejects a remote Docker host override before any Docker command',async()=>{
 const h=harness();await expect(ensureLocalPdfService({...h.options,env:{...h.options.env,DOCKER_HOST:'tcp://private.example:2376'}})).rejects.toThrow('outside this computer');expect(h.run).not.toHaveBeenCalled();
});
it('rejects a remote active context without starting its engine or containers',async()=>{
 const h=harness();h.run.mockResolvedValue({ok:true,stdout:'ssh://remote.example'});await expect(ensureLocalPdfService(h.options)).rejects.toThrow('local Docker context');expect(h.run).toHaveBeenCalledTimes(1);
});
it('reports a missing Docker CLI without downloading or changing anything',async()=>{
 const h=harness();h.run.mockResolvedValue({ok:false,stdout:'',missing:true} as never);await expect(ensureLocalPdfService(h.options)).rejects.toThrow('not installed');expect(h.fetcher).not.toHaveBeenCalled();
});
it('starts Docker Desktop and the existing renderer when they are stopped',async()=>{
 const h=harness();h.state.engine=false;h.state.containers['algt-f00-renderer'].running=false;
 expect(await ensureLocalPdfService(h.options)).toEqual({origin:'http://127.0.0.1:16430',container:'algt-f00-renderer'});
 expect(h.run).toHaveBeenCalledWith(['desktop','start','--detach'],15000);expect(h.run).toHaveBeenCalledWith(['start','algt-f00-renderer']);
 expect(h.run.mock.calls.some(([args])=>['rm','stop','pull','run'].includes(args[0]))).toBe(false);
});
it('reuses a ready renderer on repeated npm startup without creating or restarting anything',async()=>{
 const h=harness();await ensureLocalPdfService(h.options);await ensureLocalPdfService(h.options);
 expect(h.run.mock.calls.some(([args])=>['desktop','start','run','stop','rm'].includes(args[0]))).toBe(false);
 expect(h.fetcher).toHaveBeenCalledTimes(2);
});
it('reports Docker first-run/start failure before attempting any container mutation',async()=>{
 const h=harness();h.state.engine=false;h.state.desktopStart=false;await expect(ensureLocalPdfService(h.options)).rejects.toThrow('could not start automatically');
 expect(h.run.mock.calls.some(([args])=>['container','start','run'].includes(args[0]))).toBe(false);
});
it('bounds the Docker readiness wait without resetting anything',async()=>{
 const h=harness();h.state.engine=false;h.state.neverReady=true;await expect(ensureLocalPdfService(h.options)).rejects.toThrow('90 seconds');expect(h.state.time).toBe(90000);
 expect(h.run.mock.calls.some(([args])=>['start','run','rm','stop'].includes(args[0]))).toBe(false);
});
it('does not switch an existing Windows-container engine',async()=>{
 const h=harness();h.run.mockImplementation(async(args:string[])=>args[0]==='context'?{ok:true,stdout:'npipe:////./pipe/docker_engine'}:{ok:true,stdout:'windows'});
 await expect(ensureLocalPdfService(h.options)).rejects.toThrow('Linux containers');expect(h.run).toHaveBeenCalledTimes(2);
});
it.each(['image','command','mount','host','port','publish-all'])('rejects unexpected existing renderer %s settings without repairing or replacing it',async kind=>{
 const h=harness(),c=h.state.containers['algt-f00-renderer'];
 if(kind==='image')c.image='unreviewed';if(kind==='command')c.cmd=['gotenberg'];if(kind==='mount')c.mounts=[{Source:'private'}] as never;
 if(kind==='host')c.ports['3000/tcp'][0].HostIp='0.0.0.0';if(kind==='port')c.ports['3000/tcp'][0].HostPort='9999';if(kind==='publish-all')c.publishAll=true;
 await expect(ensureLocalPdfService(h.options)).rejects.toThrow('unexpected configuration');expect(h.fetcher).not.toHaveBeenCalled();
 expect(h.run.mock.calls.some(([args])=>['run','start','rm','stop'].includes(args[0]))).toBe(false);
});
it('requires its ownership label when reusing a managed container',async()=>{
 const h=harness();h.state.containers['algt-erp-local-pdf-16430']=safe();await expect(ensureLocalPdfService(h.options)).rejects.toThrow('unexpected configuration');
 expect(validRendererContainer(safe(),16430,true)).toBe(false);
});
it('creates only the owned loopback renderer from the pinned installed image, without pulling it',async()=>{
 const h=harness();delete h.state.containers['algt-f00-renderer'];await ensureLocalPdfService(h.options);
 const args=h.run.mock.calls.find(([a])=>a[0]==='run')![0];expect(args).toContain('--pull=never');expect(args).toContain(LOCAL_PDF_IMAGE);expect(args).toContain('127.0.0.1:16430:3000');expect(args).toContain('--chromium-deny-list=^https?://.*');
 expect(args).not.toContain('--volume');expect(args).not.toContain('--restart');
});
it('supports port 3100 without changing the existing legacy renderer port',async()=>{
 const h=harness();const result=await ensureLocalPdfService({...h.options,env:{GOTENBERG_URL:'http://localhost:3100'}});
 expect(result.container).toBe('algt-erp-local-pdf-3100');expect(h.state.containers['algt-f00-renderer'].ports['3000/tcp'][0].HostPort).toBe('16430');
});
it('fails a missing reviewed image without automatically pulling an image',async()=>{
 const h=harness();delete h.state.containers['algt-f00-renderer'];h.state.image=false;await expect(ensureLocalPdfService(h.options)).rejects.toThrow('image is missing');
 expect(h.run.mock.calls.some(([args])=>['run','pull'].includes(args[0]))).toBe(false);
});
it('accepts a concurrent creation only if the resulting owned container is valid and running',async()=>{
 const h=harness();delete h.state.containers['algt-f00-renderer'];h.state.create=false;expect((await ensureLocalPdfService(h.options)).container).toBe('algt-erp-local-pdf-16430');
});
it('does not delete or replace a container whose start fails',async()=>{
 const h=harness();h.state.containers['algt-f00-renderer'].running=false;h.state.start=false;await expect(ensureLocalPdfService(h.options)).rejects.toThrow('could not start');
 expect(h.run.mock.calls.some(([args])=>['rm','stop','run'].includes(args[0]))).toBe(false);
});
it('bounds unhealthy startup and never prints renderer response bodies or private exception text',async()=>{
 const h=harness();h.fetcher.mockRejectedValue(Error('PRIVATE renderer URL and token'));
 await expect(ensureLocalPdfService(h.options)).rejects.toThrow('30 seconds');expect(h.state.time).toBe(30000);expect(JSON.stringify(h.log.mock.calls)).not.toContain('PRIVATE');
});
it('hooks only local dev; production build/start commands and Next dev arguments remain intact',()=>{
 const {scripts}=JSON.parse(fs.readFileSync('package.json','utf8'));
 expect(scripts.predev).toBe('node tooling/local/ensure-pdf-service.mjs');expect(scripts.dev).toContain('next dev');
 expect(scripts.prestart).toBeUndefined();expect(scripts.prebuild).toBeUndefined();expect(scripts.start).toContain('next start');
 expect(scripts.build).not.toContain('ensure-pdf-service');expect(scripts.dev).not.toContain('ensure-pdf-service');
});
