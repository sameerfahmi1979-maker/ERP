import {expect,it} from 'vitest';
import {usesOfficialDocumentSurface} from '@/lib/report-center/output-surface';
it.each(['A','B','C','D'])('does not expose generic exports as class %s originals',document_class=>{expect(usesOfficialDocumentSurface({document_class})).toBe(true);});
it.each(['letter','certificate','form','checklist','badge'])('handles legacy official %s registrations without a class',report_category=>{expect(usesOfficialDocumentSurface({report_category})).toBe(true);});
it('retains analytical export and treats source-data previews distinctly',()=>{expect(usesOfficialDocumentSurface({document_class:'E',report_category:'list'})).toBe(false);expect(usesOfficialDocumentSurface({is_letter_type:true})).toBe(true);});
