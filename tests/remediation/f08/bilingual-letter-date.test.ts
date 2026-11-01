import {expect,it} from 'vitest';
import {getOfficialDocumentDefinition} from '@/lib/official-documents/registry';
import {renderOfficialDocumentHtml} from '@/lib/official-documents/layout/render';
import type {OfficialDocumentRenderContext} from '@/lib/official-documents/types';
const definition=getOfficialDocumentDefinition('HR_EMPLOYMENT_CONFIRMATION')!;
const context:OfficialDocumentRenderContext={row:{employee_name:'SYNTHETIC DATE CHECK',company_name:'SYNTHETIC',designation:'Test',joining_date:'2024-01-01'},rows:[],inputs:{},
 language:'bilingual',issuedDateEn:'30 October 2026',issuedDateAr:'٣٠ أكتوبر ٢٠٢٦',serialNo:null,draft:true};
it('isolates each complete date/label pair with a dash in bilingual letters',()=>{
 const html=renderOfficialDocumentHtml(definition,context);
 expect(html).toContain('<bdi lang="en" dir="ltr"><strong>Date:</strong> 30 October 2026</bdi><span class="od-date-separator" aria-hidden="true"> — </span><bdi lang="ar" dir="rtl"><strong>التاريخ:</strong> ٣٠ أكتوبر ٢٠٢٦</bdi>');
 expect(html).toContain('unicode-bidi: isolate; white-space: nowrap');expect(html).not.toContain('Date <span lang="ar" dir="rtl">/ التاريخ');
});
it('uses Arabic digits even when an upstream Arabic date contains Latin digits',()=>{
 const html=renderOfficialDocumentHtml(definition,{...context,issuedDateAr:'30 أكتوبر 2026'});
 expect(html).toContain('التاريخ:</strong> ٣٠ أكتوبر ٢٠٢٦');expect(html).toContain('Date:</strong> 30 October 2026');
});
it.each(['en','ar'] as const)('keeps %s single-language output to one labelled date',language=>{
 const html=renderOfficialDocumentHtml(definition,{...context,language});
 expect(html).not.toContain('<span class="od-date-separator"');expect(html).toContain(language==='ar'?'التاريخ:</strong> ٣٠ أكتوبر ٢٠٢٦':'Date:</strong> 30 October 2026');
 expect(html).not.toContain(language==='ar'?'Date:</strong>':'التاريخ:</strong>');
});
it('escapes date content instead of injecting markup',()=>{
 const html=renderOfficialDocumentHtml(definition,{...context,issuedDateEn:'<script>bad</script>',issuedDateAr:'<img onerror="bad">'});
 expect(html).toContain('&lt;script&gt;bad&lt;/script&gt;');expect(html).toContain('&lt;img onerror=&quot;bad&quot;&gt;');
});
