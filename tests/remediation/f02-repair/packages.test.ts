import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import { extractFileContent } from '@/lib/dms/file-content-extractor';
import { convertPdfPagesToImages } from '@/lib/dms/pdf-to-images';

describe('patched package compatibility', () => {
  it.each(['xlsx', 'biff8'] as const)('real DMS extraction retains English/Arabic spreadsheet text: %s', async bookType => {
    const workbook=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([['Name','Value'],['F02R synthetic','اختبار'],['Total',123.45]]),'Test');
    const bytes=XLSX.write(workbook,{type:'buffer',bookType});
    const result=await extractFileContent(bytes,'application/vnd.ms-excel',`synthetic.${bookType==='biff8'?'xls':'xlsx'}`);
    expect(result.hasContent).toBe(true);
    expect(result.text).toContain('F02R synthetic');
    expect(result.text).toContain('اختبار');
    expect(result.text).toContain('123.45');
  });
  it('ExcelJS round trip including conditional formatting exercises the UUID override', async () => {
    const workbook=new ExcelJS.Workbook();
    const sheet=workbook.addWorksheet('Synthetic');
    sheet.addRow(['F02R','اختبار',123.45]);
    sheet.addConditionalFormatting({ref:'C1',rules:[{type:'dataBar',priority:1,cfvo:[{type:'min'},{type:'max'}],color:{argb:'FF00AA00'}}]});
    const bytes=await workbook.xlsx.writeBuffer();
    const restored=new ExcelJS.Workbook();
    await restored.xlsx.load(bytes);
    expect(restored.getWorksheet('Synthetic')?.getCell('B1').value).toBe('اختبار');
    expect(restored.getWorksheet('Synthetic')?.getCell('C1').value).toBe(123.45);
  });
  it('patched PDF.js and native canvas render the real DMS path', async () => {
    const pdf=new jsPDF({format:[80,80]});
    pdf.text('F02R synthetic PDF',8,15);
    const images=await convertPdfPagesToImages(Buffer.from(pdf.output('arraybuffer')),1);
    expect(images).toHaveLength(1);
    expect(Buffer.from(images[0].base64,'base64').subarray(1,4).toString()).toBe('PNG');
  });
});
