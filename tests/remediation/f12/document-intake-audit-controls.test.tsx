// @vitest-environment jsdom
import {afterEach, expect, it, vi} from 'vitest';
import {cleanup, fireEvent, render} from '@testing-library/react';
import {HrDocumentComplianceReviewStep} from '@/features/hr/employees/document-create/hr-document-compliance-review-step';
import type {HrComplianceRecordSuggestion} from '@/lib/hr/document-to-record/types';
afterEach(cleanup);
const suggestion:HrComplianceRecordSuggestion={tempId:'synthetic',kind:'identity_document',classification:'PASSPORT',label:'Passport',sourceDocumentId:1,sourceDocumentTitle:'Synthetic passport',confidence:1,warnings:[],included:true,fields:{document_number:'SYN',issue_date:'2025-05-04',expiry_date:'2027-05-03'},fieldConfidence:{}};
it('renders actual calendar inputs with day-first review labels, preserving canonical dates',()=>{
 const onChange=vi.fn(),ui=render(<HrDocumentComplianceReviewStep suggestions={[suggestion]} onChange={onChange} onNext={vi.fn()} onBack={vi.fn()}/>);
 const issue=ui.getByLabelText('Issue Date') as HTMLInputElement,expiry=ui.getByLabelText('Expiry Date') as HTMLInputElement;
 expect(issue.type).toBe('date');expect(expiry.type).toBe('date');expect(issue.value).toBe('2025-05-04');expect(ui.getByText('04/05/2025 (day/month/year)')).toBeTruthy();
 fireEvent.change(issue,{target:{value:'2025-06-07'}});expect(onChange.mock.calls.at(-1)?.[0][0].fields.issue_date).toBe('2025-06-07');
 fireEvent.change(expiry,{target:{value:''}});expect(onChange.mock.calls.at(-1)?.[0][0].fields.expiry_date).toBeNull();
 expect((ui.getByLabelText('Document Number') as HTMLInputElement).type).toBe('text');
});
it('keeps excluded records excluded rather than creating hidden date controls',()=>{const ui=render(<HrDocumentComplianceReviewStep suggestions={[{...suggestion,included:false}]} onChange={vi.fn()} onNext={vi.fn()} onBack={vi.fn()}/>);expect(ui.queryByLabelText('Issue Date')).toBeNull();});
