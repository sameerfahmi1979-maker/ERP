import {beforeEach,afterEach,it,expect,vi} from 'vitest';
// The production/local helper stays path-pinned. Only this isolated test supplies
// an approved logical root and POSIX joins, so Linux CI never needs that real
// directory, Docker, a linked project or any private fixture files.
const calls=vi.hoisted(()=>({root:'C:/dev/agt-erp-f06',rootResolution:vi.fn(),exists:vi.fn(),inspect:vi.fn(),exec:vi.fn(),
 read:vi.fn(()=>{throw Error('Private filesystem reads are forbidden in the guard test');}),
 write:vi.fn(()=>{throw Error('Filesystem writes are forbidden in the guard test');}),
}));
vi.mock('node:child_process',()=>({execFileSync:calls.inspect,spawnSync:calls.exec}));
vi.mock('node:fs',()=>({default:{existsSync:calls.exists,readFileSync:calls.read,writeFileSync:calls.write}}));
vi.mock('node:path',async importOriginal=>{
 const actual=await importOriginal<typeof import('node:path')>();
 const resolve=(...parts:string[])=>{if(parts.length===2&&parts[1]==='../../..'){calls.rootResolution(parts[0]);return calls.root;}return actual.resolve(...parts);};
 return {...actual,resolve,join:actual.posix.join,default:{...actual,resolve,join:actual.posix.join}};
});
const original=process.env.ALGT_F06_LOCAL_TARGET;
const record=(id='a'.repeat(64))=>({Id:id,Config:{Labels:{'com.supabase.cli.project':'algt-f06-local'}},HostConfig:{PortBindings:{'5432/tcp':[{HostIp:'127.0.0.1',HostPort:'16622'}]}},State:{Running:true}});
const projectRef='C:/dev/agt-erp-f06/CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F06/local/supabase/.temp/project-ref';
const capture=(run:()=>unknown)=>{try{run();}catch(error){return error;}throw Error('Expected the specific guard to reject');};
beforeEach(()=>{vi.resetModules();delete process.env.ALGT_F06_LOCAL_TARGET;calls.root='C:/dev/agt-erp-f06';calls.rootResolution.mockClear();calls.exists.mockReset().mockReturnValue(false);calls.read.mockClear();calls.write.mockClear();calls.inspect.mockReset().mockReturnValue(JSON.stringify([record()]));calls.exec.mockReset().mockReturnValue({status:0,stdout:'1\n'});});
afterEach(()=>{if(original===undefined)delete process.env.ALGT_F06_LOCAL_TARGET;else process.env.ALGT_F06_LOCAL_TARGET=original;expect(calls.read).not.toHaveBeenCalled();expect(calls.write).not.toHaveBeenCalled();});
it('checks the isolated target once and addresses its immutable ID for repeated SQL',async()=>{
 const {sql}=await import('./local-db.mjs');expect(sql('select 1')).toBe('1');expect(sql('select 2')).toBe('1');
 expect(calls.rootResolution).toHaveBeenCalledTimes(1);expect(calls.exists).toHaveBeenCalledExactlyOnceWith(projectRef);
 expect(calls.inspect).toHaveBeenCalledTimes(1);expect(calls.exec).toHaveBeenCalledTimes(2);
 for(const [,args]of calls.exec.mock.calls){expect(args).toContain('a'.repeat(64));expect(args).not.toContain('supabase_db_algt-f06-local');}
});
it('a replaced container name never retargets an already pinned SQL session',async()=>{
 const {sql,guard}=await import('./local-db.mjs');sql('select 1');calls.inspect.mockReturnValue(JSON.stringify([record('b'.repeat(64))]));expect(guard()).toBe('b'.repeat(64));
 calls.exec.mockReturnValue({status:1,stderr:'No such container: retired original'});expect(()=>sql('select 2')).toThrow('No such container');
 expect(calls.exec.mock.calls.at(-1)?.[1]).toContain('a'.repeat(64));expect(calls.exec.mock.calls.at(-1)?.[1]).not.toContain('b'.repeat(64));
});
it.each(['label','port','binding','stopped','identity'] as const)('rejects a wrong %s before sending SQL',async bad=>{
 const target=record();if(bad==='label')target.Config.Labels['com.supabase.cli.project']='other-chat';if(bad==='port')target.HostConfig.PortBindings['5432/tcp'][0].HostPort='54322';if(bad==='binding')target.HostConfig.PortBindings['5432/tcp'][0].HostIp='0.0.0.0';if(bad==='stopped')target.State.Running=false;if(bad==='identity')target.Id='not-an-immutable-id';
 const expected={label:{actual:'other-chat',expected:'algt-f06-local'},port:{actual:'54322',expected:'16622'},binding:{actual:'0.0.0.0',expected:'127.0.0.1'},stopped:{actual:false,expected:true},identity:{actual:'not-an-immutable-id',expected:/^[a-f0-9]{64}$/}}[bad];
 calls.inspect.mockReturnValue(JSON.stringify([target]));const {sql}=await import('./local-db.mjs');expect(capture(()=>sql('select 1'))).toMatchObject({code:'ERR_ASSERTION',...expected});
 expect(calls.exists).toHaveBeenCalledExactlyOnceWith(projectRef);expect(calls.inspect).toHaveBeenCalledTimes(1);expect(calls.exec).not.toHaveBeenCalled();
});
it('rejects a simulated Linux checkout root before inspecting Docker or files',async()=>{
 calls.root='/home/runner/work/agt-erp/agt-erp';const {sql}=await import('./local-db.mjs');
 expect(capture(()=>sql('select 1'))).toMatchObject({code:'ERR_ASSERTION',actual:calls.root,expected:'C:/dev/agt-erp-f06'});
 expect(calls.exists).not.toHaveBeenCalled();expect(calls.inspect).not.toHaveBeenCalled();expect(calls.exec).not.toHaveBeenCalled();
});
it('rejects a linked project before inspecting Docker even with the approved logical root',async()=>{
 calls.exists.mockReturnValue(true);const {sql}=await import('./local-db.mjs');
 expect(capture(()=>sql('select 1'))).toMatchObject({code:'ERR_ASSERTION',actual:false,expected:true});
 expect(calls.exists).toHaveBeenCalledExactlyOnceWith(projectRef);expect(calls.inspect).not.toHaveBeenCalled();expect(calls.exec).not.toHaveBeenCalled();
});
