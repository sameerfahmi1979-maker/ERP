// @vitest-environment jsdom
// Actual Candidate controller, Profile controls and shared shell; server/lookup doubles only.
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AuthContext } from '@/lib/rbac/check';
const mocks=vi.hoisted(()=>({create:vi.fn(),update:vi.fn(),error:vi.fn()}));
vi.mock('next/navigation',()=>({usePathname:()=>'/admin/hr/recruitment/candidates/record/new',useRouter:()=>({replace:vi.fn()})}));
vi.mock('@/components/workspace/workspace-provider',()=>({useWorkspaceContext:()=>null}));
vi.mock('@/components/workspace/workspace-draft-provider',()=>({useWorkspaceDraftStoreContext:()=>null}));
vi.mock('@/hooks/use-workspace',()=>({useWorkspace:()=>({closeTab:vi.fn(),markDirty:vi.fn(),updateTabRoute:vi.fn(),isTabActive:()=>true})}));
vi.mock('@tanstack/react-query',()=>({useQuery:()=>({data:undefined})}));
vi.mock('sonner',()=>({toast:{error:mocks.error,success:vi.fn()}}));
vi.mock('@/server/actions/hr/recruitment',()=>({createCandidate:mocks.create,updateCandidate:mocks.update,getRecruitmentSalaryAccess:vi.fn(),listJobRequisitions:vi.fn()}));
vi.mock('@/features/hr/recruitment/tabs/candidate-conversion-tab',()=>({CandidateConversionTab:()=>null}));
vi.mock('@/features/hr/recruitment/tabs/candidate-documents-tab',()=>({CandidateDocumentsTab:()=>null}));
vi.mock('@/features/hr/recruitment/tabs/candidate-interviews-tab',()=>({CandidateInterviewsTab:()=>null}));
vi.mock('@/features/hr/recruitment/tabs/candidate-offers-tab',()=>({CandidateOffersTab:()=>null}));
vi.mock('@/features/hr/recruitment/tabs/candidate-onboarding-tab',()=>({CandidateOnboardingTab:()=>null}));
vi.mock('@/features/hr/recruitment/tabs/candidate-overview-tab',()=>({CandidateOverviewTab:()=>null}));
import {CandidateWorkspaceForm} from '@/features/hr/recruitment/candidate-workspace-form';
const auth={permissionCodes:['hr.recruitment.manage'],roleCodes:[]} as AuthContext;
beforeEach(()=>vi.clearAllMocks());
afterEach(cleanup);
const mount=()=>render(<CandidateWorkspaceForm mode="add" authContext={auth}/>);
it('first Save from Overview reveals Profile, summarizes and focuses the required name without a server request',()=>{
 const ui=mount();expect(ui.container.querySelectorAll('form')).toHaveLength(1);
 fireEvent.click(ui.getByRole('button',{name:'Save',exact:true}));
 expect(mocks.create).not.toHaveBeenCalled();expect(ui.getByRole('alert').textContent).toContain('Full Name (English)');
 expect(document.activeElement).toBe(ui.getByLabelText('Full Name (English)'));
 expect(ui.getByLabelText('Full Name (English)').closest('[data-workspace-section]')?.getAttribute('aria-hidden')).toBe('false');
});
it('Enter and whitespace-only names cannot bypass focused validation',async()=>{
 const ui=mount();fireEvent.submit(ui.container.querySelector('form')!);expect(mocks.create).not.toHaveBeenCalled();
 fireEvent.change(ui.getByLabelText('Full Name (English)'),{target:{value:'   '}});
 fireEvent.click(ui.getByRole('button',{name:'Save',exact:true}));
 await waitFor(()=>expect(ui.getByRole('alert').textContent).toContain("Full Name (English): Enter the candidate's name."));
 await waitFor(()=>expect(document.activeElement).toBe(ui.getByLabelText('Full Name (English)')));
 expect(mocks.create).not.toHaveBeenCalled();
});
it('an invalid email is explained without losing other entered values',()=>{
 const ui=mount();fireEvent.change(ui.getByLabelText('Full Name (English)'),{target:{value:'Synthetic candidate'}});
 fireEvent.change(ui.getByLabelText('Email'),{target:{value:'not-an-email'}});
 fireEvent.click(ui.getByRole('button',{name:'Save',exact:true}));expect(mocks.create).not.toHaveBeenCalled();
 expect(ui.getByRole('alert').textContent).toContain('Email');expect(document.activeElement).toBe(ui.getByLabelText('Email'));
 expect((ui.getByLabelText('Full Name (English)') as HTMLInputElement).value).toBe('Synthetic candidate');
});
it('server rejection maps a named custom combobox to the visible Profile control',async()=>{
 mocks.create.mockResolvedValueOnce({success:false,fieldErrors:{requisition_id:'Check the required value and format.'}});
 const ui=mount();fireEvent.change(ui.getByLabelText('Full Name (English)'),{target:{value:'Synthetic candidate'}});
 await act(async()=>fireEvent.click(ui.getByRole('button',{name:'Save',exact:true})));
 await waitFor(()=>expect(ui.getByRole('alert').textContent).toContain('Job Requisition'));
 expect(mocks.create).toHaveBeenCalledTimes(1);expect(document.activeElement).toBe(ui.getByRole('combobox',{name:'Job Requisition'}));
 expect(ui.getByRole('combobox',{name:'Job Requisition'}).getAttribute('aria-invalid')).toBe('true');
});
it('a late rejection cannot annotate a different candidate reusing the same form ID',async()=>{
 let settle!:(value:unknown)=>void;
 mocks.create.mockImplementationOnce(()=>new Promise(resolve=>{settle=resolve;}));
 const old=mount();fireEvent.change(old.getByLabelText('Full Name (English)'),{target:{value:'Earlier synthetic candidate'}});
 fireEvent.click(old.getByRole('button',{name:'Save',exact:true}));expect(mocks.create).toHaveBeenCalledTimes(1);
 old.unmount();const next=mount();
 await act(async()=>settle({success:false,fieldErrors:{full_name_en:'An earlier record failed.'}}));
 expect(next.queryByRole('alert')).toBeNull();expect(next.getByLabelText('Full Name (English)').getAttribute('aria-invalid')).toBeNull();
});
