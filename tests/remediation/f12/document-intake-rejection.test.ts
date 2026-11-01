import {expect,it} from 'vitest';
import {documentEmployeeRejection} from '@/lib/hr/document-to-record/save-rejection';
it('explains the exact employer/designation mismatch without exposing database text',()=>expect(documentEmployeeRejection({code:'23514',message:'Designation does not match the selected employer and department'})).toMatch(/Choose a designation.*employer and department/));
it.each(['PRIVATE_EMPLOYEE_RECORD','Designation does not match the selected employer and department PRIVATE','__proto__','constructor'])('does not expose arbitrary rejected values %s',message=>expect(documentEmployeeRejection({code:'23514',message})).toBeNull());
it('does not translate unknown/uncertain or malformed SQLSTATE codes',()=>{for(const code of ['23514suffix','08007','40003',undefined])expect(documentEmployeeRejection({code,message:'Designation does not match the selected employer and department'})).toBeNull();});
