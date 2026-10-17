import {expect,it} from 'vitest';
import {runTemplateSecurityReview} from '@/lib/template-governance/security-review';
import {reviewVisualLayoutZone} from '@/lib/report-designer/visual-template-security-review';
import {EMPTY_LAYOUT} from '@/lib/report-designer/types';
it('accepts truly unset database-default zones without inventing visual content',()=>{
 expect(runTemplateSecurityReview({visual_editor_engine:'puck',visual_layout_schema_version:1,header_layout_json:{},body_layout_json:{},footer_layout_json:{},body_html_en:'<p>Safe synthetic text</p>'}).passed).toBe(true);
});
it('still blocks unsafe legacy content when visual zones are unset',()=>{
 expect(runTemplateSecurityReview({header_layout_json:{},body_html_en:'<script>unsafe</script>'}).passed).toBe(false);
});
it('an empty content array cannot bypass malformed layout validation',()=>{
 expect(reviewVisualLayoutZone({content:[],unexpected:'<script>unsafe</script>'},'body').some(f=>f.severity==='block')).toBe(true);
});
it('an empty content array cannot bypass unsupported engine validation',()=>{
 expect(reviewVisualLayoutZone({...EMPTY_LAYOUT,engine:'unapproved'},'body').some(f=>f.severity==='block')).toBe(true);
});
it('continues accepting a canonical, validated empty layout',()=>{
 expect(reviewVisualLayoutZone(EMPTY_LAYOUT,'body')).toEqual([]);
});
