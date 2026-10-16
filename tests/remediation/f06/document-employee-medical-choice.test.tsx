// @vitest-environment jsdom
import {cleanup,fireEvent,render} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import type {HrComplianceRecordSuggestion} from '@/lib/hr/document-to-record/types';
import {HrDocumentComplianceReviewStep} from '@/features/hr/employees/document-create/hr-document-compliance-review-step';
const medical:HrComplianceRecordSuggestion={kind:'medical_insurance',classification:'MEDICAL_INSURANCE',tempId:'medical',label:'Medical insurance',sourceDocumentId:2,sourceDocumentTitle:'Synthetic source',confidence:0.9,included:true,warnings:[],fieldConfidence:{},fields:{insurance_provider:'Synthetic',policy_number:'SYN',expiry_date:'2027-01-01',employee_covered:null,dependent_coverage_included:null}};
afterEach(cleanup);
it('real compliance step starts both medical facts unanswered and preserves explicit false choices',()=>{
 const change=vi.fn(),props={suggestions:[medical],onChange:change,onNext:vi.fn(),onBack:vi.fn()},ui=render(<HrDocumentComplianceReviewStep {...props}/>);
 expect((ui.getByLabelText('Employee covered') as HTMLSelectElement).value).toBe('');expect((ui.getByLabelText('Dependent coverage included') as HTMLSelectElement).value).toBe('');
 fireEvent.change(ui.getByLabelText('Employee covered'),{target:{value:'false'}});expect(change.mock.calls[0][0][0].fields).toMatchObject({employee_covered:false,dependent_coverage_included:null});
 ui.rerender(<HrDocumentComplianceReviewStep {...props} suggestions={change.mock.calls[0][0]}/>);
 fireEvent.change(ui.getByLabelText('Dependent coverage included'),{target:{value:'false'}});expect(change.mock.calls[1][0][0].fields).toMatchObject({employee_covered:false,dependent_coverage_included:false});
});
it('real compliance step can clear a prior choice without inventing a default',()=>{const change=vi.fn(),ui=render(<HrDocumentComplianceReviewStep suggestions={[{...medical,fields:{...medical.fields,employee_covered:true,dependent_coverage_included:false}}]} onChange={change} onNext={vi.fn()} onBack={vi.fn()}/>);fireEvent.change(ui.getByLabelText('Employee covered'),{target:{value:''}});expect(change.mock.calls[0][0][0].fields).toMatchObject({employee_covered:null,dependent_coverage_included:false});});
