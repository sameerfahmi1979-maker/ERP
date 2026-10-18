import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import fs from 'node:fs';
const m=vi.hoisted(()=>({hold:vi.fn(),save:vi.fn(),click:vi.fn(),create:vi.fn(),revoke:vi.fn(),errors:vi.fn()}));
vi.mock('@/lib/logger',()=>({logger:{error:m.errors}}));
vi.mock('exceljs',async original=>{
 const actual=await original<typeof import('exceljs')>();const Workbook=actual.default.Workbook;
 class ControlledWorkbook extends Workbook{constructor(){super();const native=this.xlsx.writeBuffer.bind(this.xlsx);this.xlsx.writeBuffer=async(options)=>{const bytes=await native(options);await m.hold();return bytes;};}}
 return {...actual,default:{...actual.default,Workbook:ControlledWorkbook}};
});
vi.mock('jspdf',async original=>{const actual=await original<typeof import('jspdf')>();return {...actual,default:new Proxy(actual.default,{construct(target,args){const doc=Reflect.construct(target,args);doc.save=m.save;return doc;}})};});
const options={title:'Synthetic extract',filename:'SYNTHETIC',columns:[{key:'code',header:'Code'}],data:[{code:'00001'}]};
beforeEach(()=>{vi.clearAllMocks();vi.resetModules();m.hold.mockResolvedValue(undefined);m.create.mockReturnValue('blob:offline');vi.stubGlobal('document',{createElement:()=>({style:{},click:m.click}),body:{appendChild:vi.fn(),removeChild:vi.fn()}});vi.spyOn(URL,'createObjectURL').mockImplementation(m.create);vi.spyOn(URL,'revokeObjectURL').mockImplementation(m.revoke);});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
it('blocks a stale Excel download after actual asynchronous workbook serialization',async()=>{
 let finish!:()=>void;let live=true;m.hold.mockImplementation(()=>new Promise<void>(r=>{finish=r;}));const {exportToExcel}=await import('@/lib/export/excel');const pending=exportToExcel({...options,canCommit:()=>live});await vi.waitFor(()=>expect(m.hold).toHaveBeenCalled());live=false;finish();expect(await pending).toMatchObject({success:false,error:expect.stringMatching(/no longer current/)});expect(m.click).not.toHaveBeenCalled();expect(m.create).not.toHaveBeenCalled();
});
it('retains a current Excel download and cleans up its temporary object URL',async()=>{const {exportToExcel}=await import('@/lib/export/excel');expect((await exportToExcel({...options,canCommit:()=>true})).success).toBe(true);expect(m.click).toHaveBeenCalledTimes(1);expect(m.revoke).toHaveBeenCalledWith('blob:offline');});
it('blocks a stale PDF save after actual font work completes',async()=>{
 let finish!:(response:Response)=>void;let live=true;const fetch=vi.fn(()=>new Promise<Response>(r=>{finish=r;}));vi.stubGlobal('fetch',fetch);const {exportToPDF}=await import('@/lib/export/pdf');const pending=exportToPDF({...options,columns:[{key:'code',header:'الاسم / Name'}],canCommit:()=>live});await vi.waitFor(()=>expect(fetch).toHaveBeenCalledTimes(1));live=false;finish(new Response(fs.readFileSync('public/fonts/noto-sans-arabic-400.ttf')));expect(await pending).toMatchObject({success:false,error:expect.stringMatching(/no longer current/)});expect(m.save).not.toHaveBeenCalled();
});
it('retired CSV and print commands cannot begin a download or open a print window',async()=>{
 const {exportToCSV}=await import('@/lib/export/csv');const {exportToPrint}=await import('@/lib/export/print');const open=vi.fn();vi.stubGlobal('window',{open});expect(exportToCSV({...options,canCommit:()=>false}).success).toBe(false);expect(exportToPrint({...options,canCommit:()=>false}).success).toBe(false);expect(open).not.toHaveBeenCalled();expect(m.click).not.toHaveBeenCalled();
});
