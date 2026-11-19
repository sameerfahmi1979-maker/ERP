import {EventEmitter} from 'node:events';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({spawn:vi.fn()}));
vi.mock('node:child_process',()=>({spawn:m.spawn}));
import {validateDmsDocument} from '@/server/dms-document-parser';
function child(){return Object.assign(new EventEmitter(),{stdout:new EventEmitter(),stdin:Object.assign(new EventEmitter(),{end:vi.fn()}),kill:vi.fn()});}
beforeEach(()=>{vi.resetAllMocks();vi.useFakeTimers();});afterEach(()=>vi.useRealTimers());
it('only a successful exact protocol response can accept a document',async()=>{const p=child();m.spawn.mockReturnValue(p);const result=validateDmsDocument(Buffer.from('synthetic'),'application/pdf');p.stdout.emit('data',Buffer.from('F07_FORMAT_VALID\n'));p.emit('close',0);await expect(result).resolves.toBeUndefined();expect(p.kill).toHaveBeenCalledOnce();});
it('does not pass provider keys, database secrets or NODE_OPTIONS into the parser',async()=>{const p=child();m.spawn.mockReturnValue(p);const result=validateDmsDocument(Buffer.from('synthetic'),'application/pdf');const [executable,args,options]=m.spawn.mock.calls[0];expect(executable).toBe(process.execPath);expect(args[0]).toBe('--max-old-space-size=384');expect(Object.keys(options.env).every(k=>['NODE_ENV','SystemRoot','SYSTEMROOT','WINDIR','windir','TEMP','TMP'].includes(k))).toBe(true);expect(options.windowsHide).toBe(true);expect(options.stdio).toEqual(['pipe','pipe','ignore']);p.emit('close',1);await expect(result).rejects.toThrow();});
it('kills a stalled parser at the deadline instead of only timing out its caller',async()=>{const p=child();m.spawn.mockReturnValue(p);const result=validateDmsDocument(Buffer.from('synthetic'),'application/pdf'),outcome=expect(result).rejects.toThrow(/timed out/);await vi.advanceTimersByTimeAsync(10000);await outcome;expect(p.kill).toHaveBeenCalledOnce();});
it('limits active parser processes and releases capacity after failure',async()=>{const a=child(),b=child();m.spawn.mockReturnValueOnce(a).mockReturnValueOnce(b);const first=validateDmsDocument(Buffer.from('a'),'application/pdf'),second=validateDmsDocument(Buffer.from('b'),'application/pdf');await expect(validateDmsDocument(Buffer.from('c'),'application/pdf')).rejects.toThrow(/busy/);a.emit('close',1);b.emit('close',1);await Promise.all([expect(first).rejects.toThrow(),expect(second).rejects.toThrow()]);expect(m.spawn).toHaveBeenCalledTimes(2);});

it('lets a large PDF return a valid result after the short parser deadline', async () => {
  const parser = child();
  m.spawn.mockReturnValue(parser);
  const outcome = validateDmsDocument(Buffer.alloc(18 * 1024 * 1024), 'application/pdf')
    .then(() => 'accepted', () => 'rejected');
  await vi.advanceTimersByTimeAsync(11_000);
  parser.stdout.emit('data', Buffer.from('F07_FORMAT_VALID\n'));
  parser.emit('close', 0);
  expect(await outcome).toBe('accepted');
});

it('kills a stalled large PDF parser at its finite deadline', async () => {
  const parser = child();
  m.spawn.mockReturnValue(parser);
  const outcome = expect(validateDmsDocument(Buffer.alloc(18 * 1024 * 1024), 'application/pdf'))
    .rejects.toThrow(/timed out/);
  await vi.advanceTimersByTimeAsync(29_999);
  expect(parser.kill).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  await outcome;
  expect(parser.kill).toHaveBeenCalledOnce();
});
