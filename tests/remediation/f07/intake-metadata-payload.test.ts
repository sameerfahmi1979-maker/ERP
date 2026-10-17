import {expect,it} from 'vitest';
import {resolveMetadataPayloadColumns} from '@/lib/dms/approve/approve-ai-intake-payload';
it.each(['number','decimal','currency'])('converts %s without dropping zero',type=>{expect(resolveMetadataPayloadColumns(type,'0')).toEqual({value_number:0});expect(resolveMetadataPayloadColumns(type,'1.25e2')).toEqual({value_number:125});});
it.each(['12oops','NaN','Infinity','1e999',' 12','12 '])('rejects malformed number %s',raw=>{expect(()=>resolveMetadataPayloadColumns('currency',raw)).toThrow();});
it.each(['json','multiselect','multi_select'])('converts actual %s JSON',type=>{expect(resolveMetadataPayloadColumns(type,'["Alpha","Beta"]')).toEqual({value_json:['Alpha','Beta']});expect(()=>resolveMetadataPayloadColumns(type,'not JSON')).toThrow();});
it.each(['true','1','false','0'])('preserves explicit boolean %s',raw=>{expect(resolveMetadataPayloadColumns('boolean',raw)).toEqual({value_boolean:['true','1'].includes(raw)});});
it.each(['yes','no','', 'FALSE'])('rejects unspecified boolean %s',raw=>{expect(()=>resolveMetadataPayloadColumns('boolean',raw)).toThrow();});
