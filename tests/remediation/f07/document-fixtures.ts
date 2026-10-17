import {jsPDF} from 'jspdf';
/** Genuine parseable synthetic PDF; never replace parser tests with header-only bytes. */
export function syntheticPdf(text='Synthetic F07 document'){
 const pdf=new jsPDF({compress:false});pdf.setFileId('F0700000000000000000000000000001');pdf.setCreationDate(new Date(Date.UTC(2026,9,17)));pdf.text(text,10,20);
 return Buffer.from(pdf.output('arraybuffer'));
}
