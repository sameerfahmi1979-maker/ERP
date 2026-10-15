// @vitest-environment jsdom
import './setup';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { ControlledFormFeedback } from '@/components/workspace/controlled-form-feedback';
import { ValidatedTaskForm } from '@/components/workspace/validated-task-form';
import { changePasswordSchema } from '@/lib/validation/auth';
import { ForgotPasswordForm } from '@/features/auth/forgot-password-form';
import { ResetPasswordForm } from '@/features/auth/reset-password-form';
import { AppBrandingSettingsPageClient } from '@/features/branding/app-branding-settings-page-client';
import type { AppBrandingSettings } from '@/lib/branding';
import type { RuntimeAppBranding } from '@/lib/branding/runtime-types';
const mocks=vi.hoisted(()=>({reset:vi.fn(),complete:vi.fn(),branding:vi.fn(),navigate:vi.fn(),refresh:vi.fn()}));
vi.mock('next/navigation',()=>({usePathname:()=>'/synthetic',useRouter:()=>({push:vi.fn(),refresh:mocks.refresh})}));
vi.mock('@/server/actions/users/account-security',()=>({requestPasswordReset:mocks.reset,recordPasswordResetCompleted:mocks.complete}));
vi.mock('@/lib/auth/client-session',()=>({navigateAfterIdentityChange:mocks.navigate}));
vi.mock('@/features/auth/password-reverification',()=>({PasswordReverification:()=> <h1>Reverify safely</h1>}));
vi.mock('@/components/erp/page-header',()=>({ERPPageHeader:()=> <h1>Branding</h1>}));
vi.mock('@/features/branding/branding-asset-upload-card',()=>({BrandingAssetUploadCard:({canUpload,label}:{canUpload:boolean;label:string})=><button disabled={!canUpload}>Upload {label}</button>}));
vi.mock('@/server/actions/branding/app-settings',()=>({updateAppBrandingSettings:mocks.branding}));
afterEach(cleanup);
beforeEach(()=>{vi.clearAllMocks();localStorage.clear();sessionStorage.clear();mocks.reset.mockResolvedValue(undefined);});
it('both missing password fields receive actionable errors without changing the accepted password policy',()=>{
 const invalid=changePasswordSchema.safeParse({password:'',confirmPassword:''});expect(invalid.success).toBe(false);if(!invalid.success)expect(new Set(invalid.error.issues.map(issue=>issue.path[0]))).toEqual(new Set(['password','confirmPassword']));
 expect(changePasswordSchema.safeParse({password:'Synthetic-Valid-421',confirmPassword:'Synthetic-Valid-421'}).success).toBe(true);
});
it('inline task validates, coalesces submissions, and retains values after a response failure',async()=>{
 let reject!:(error:Error)=>void;const save=vi.fn(()=>new Promise((_,failure)=>{reject=failure;}));
 render(<ValidatedTaskForm onSubmit={save}><label htmlFor="task-name">Task name</label><input id="task-name" name="task" required/><button type="submit">Save task</button></ValidatedTaskForm>);
 const button=screen.getByText('Save task'),form=button.closest('form')!;fireEvent.submit(form);expect(screen.getByRole('alert').textContent).toContain('Task name');expect(save).not.toHaveBeenCalled();
 fireEvent.change(screen.getByLabelText('Task name'),{target:{value:'Synthetic retained input'}});fireEvent.submit(form);fireEvent.submit(form);expect(save).toHaveBeenCalledTimes(1);reject(new Error('Synthetic response lost'));await screen.findByText(/The save could not be confirmed/);expect((screen.getByLabelText('Task name') as HTMLInputElement).value).toBe('Synthetic retained input');expect(localStorage.length+sessionStorage.length).toBe(0);
});
it('schema errors link to their field, restore descriptions and never store values',async()=>{
 function Fixture(){const [invalid,setInvalid]=useState(true);return <form><ControlledFormFeedback errors={invalid?{email:{message:'Enter a valid email address.'}}:{}} labels={{email:'Email'}}/><label htmlFor="a">Email</label><input id="a" name="email" aria-describedby="hint" defaultValue="private-entry"/><p id="hint">Hint</p><button type="button" onClick={()=>setInvalid(false)}>Correct</button></form>;}
 render(<Fixture/>);const input=screen.getByLabelText('Email');expect(input.getAttribute('aria-invalid')).toBe('true');fireEvent.click(screen.getByRole('button',{name:'Email: Enter a valid email address.'}));expect(document.activeElement).toBe(input);expect(screen.getByRole('alert').textContent).not.toContain('private-entry');fireEvent.click(screen.getByText('Correct'));await waitFor(()=>expect(input.hasAttribute('aria-invalid')).toBe(false));expect(input.getAttribute('aria-describedby')).toBe('hint');expect(localStorage.length+sessionStorage.length).toBe(0);
});
it('invalid recovery input gets linked summary without a request',async()=>{
 render(<ForgotPasswordForm/>);fireEvent.submit(screen.getByRole('button',{name:'Send reset link'}).closest('form')!);await screen.findByRole('alert');
 // The summary is rendered before useInlineFieldFeedback's effect annotates
 // the input. Await that independent observable state, not a fixed delay.
 const input=screen.getByLabelText(/^Email\s*\*$/);
 await waitFor(()=>expect(input.getAttribute('aria-invalid')).toBe('true'));
 expect(mocks.reset).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:/^Email:/}));expect(document.activeElement).toBe(input);
});
it('generic recovery result hides eligibility and coalesces double submit',async()=>{
 let resolve!:()=>void;mocks.reset.mockImplementation(()=>new Promise<void>(r=>{resolve=r;}));render(<ForgotPasswordForm/>);fireEvent.change(screen.getByLabelText(/^Email\s*\*$/),{target:{value:'synthetic@example.invalid'}});const form=screen.getByRole('button',{name:'Send reset link'}).closest('form')!;fireEvent.submit(form);fireEvent.submit(form);await waitFor(()=>expect(mocks.reset).toHaveBeenCalledTimes(1));resolve();await screen.findByText('Check your email');expect(screen.getByText(/If your account is eligible/)).toBeTruthy();
});
it('recovery errors stay visible and retry retains operation identity',async()=>{
 mocks.complete.mockResolvedValue({success:false,error:'Choose a different password.'});render(<ResetPasswordForm/>);fireEvent.change(screen.getByLabelText(/^New password\s*\*$/),{target:{value:'Synthetic-Only-4821'}});fireEvent.change(screen.getByLabelText(/^Confirm password\s*\*$/),{target:{value:'Synthetic-Only-4821'}});fireEvent.click(screen.getByRole('button',{name:'Update password'}));await screen.findByText('Choose a different password.');const id=mocks.complete.mock.calls[0][0].operationId;fireEvent.click(screen.getByRole('button',{name:'Update password'}));await waitFor(()=>expect(mocks.complete).toHaveBeenCalledTimes(2));expect(mocks.complete.mock.calls[1][0].operationId).toBe(id);expect(localStorage.length+sessionStorage.length).toBe(0);
});
it('reverification clears password controls and uses the existing safe flow',async()=>{
 mocks.complete.mockResolvedValue({success:false,requiresFreshSignIn:true});render(<ResetPasswordForm flow="invite"/>);for(const label of [/^New password\s*\*$/,/^Confirm password\s*\*$/])fireEvent.change(screen.getByLabelText(label),{target:{value:'Synthetic-Only-4821'}});fireEvent.click(screen.getByRole('button',{name:'Create password'}));await screen.findByText('Reverify safely');expect(screen.queryByLabelText(/^New password\s*\*$/)).toBeNull();expect(mocks.navigate).not.toHaveBeenCalled();
});
const branding={id:1,app_name:'Synthetic'} as AppBrandingSettings;
const runtime={assets:{}} as RuntimeAppBranding;
it('valid branding reaches the existing action and failure retains inputs',async()=>{
 mocks.branding.mockResolvedValue({success:false});render(<AppBrandingSettingsPageClient settings={branding} runtimeBranding={runtime} canManage canUpload={false}/>);fireEvent.click(screen.getByRole('button',{name:'Save Settings'}));await waitFor(()=>expect(mocks.branding).toHaveBeenCalledTimes(1));expect(mocks.branding.mock.calls[0][0].app_name).toBe('Synthetic');expect(await screen.findByText(/Settings were not saved/)).toBeTruthy();expect((screen.getByLabelText(/^App Name/) as HTMLInputElement).value).toBe('Synthetic');
});
it('branding validates name, email and color before calling an action',()=>{
 render(<AppBrandingSettingsPageClient settings={branding} runtimeBranding={runtime} canManage canUpload={false}/>);fireEvent.change(screen.getByLabelText(/^App Name\s*\*$/),{target:{value:''}});fireEvent.change(screen.getByLabelText('Support Email'),{target:{value:'invalid'}});fireEvent.change(screen.getByLabelText('Primary Color'),{target:{value:'bad'}});fireEvent.click(screen.getByRole('button',{name:'Save Settings'}));expect(screen.getByRole('alert').textContent).toContain('Check 3 fields');expect(mocks.branding).not.toHaveBeenCalled();fireEvent.click(within(screen.getByRole('alert')).getByRole('button',{name:/Support Email/}));expect(document.activeElement).toBe(screen.getByLabelText('Support Email'));
});
it('view-only branding has no save action and disabled fields',()=>{
 render(<AppBrandingSettingsPageClient settings={branding} runtimeBranding={runtime} canManage={false} canUpload={false}/>);expect(screen.queryByRole('button',{name:'Save Settings'})).toBeNull();expect((screen.getByLabelText('App Name') as HTMLInputElement).disabled).toBe(true);
});
it('branding dirty state blocks asset changes; save coalesces and refreshes without a hard reload',async()=>{
 let resolve!:(value:unknown)=>void;mocks.branding.mockImplementation(()=>new Promise(r=>{resolve=r;}));render(<AppBrandingSettingsPageClient settings={branding} runtimeBranding={runtime} canManage canUpload/>);
 fireEvent.change(screen.getByLabelText(/^App Name/),{target:{value:'Updated Synthetic'}});expect((screen.getByRole('button',{name:'Upload Small Logo'}) as HTMLButtonElement).disabled).toBe(true);
 const form=screen.getByRole('button',{name:'Save Settings'}).closest('form')!;fireEvent.submit(form);fireEvent.submit(form);await waitFor(()=>expect(mocks.branding).toHaveBeenCalledOnce());expect(screen.getByLabelText(/^App Name/).closest('fieldset')?.disabled).toBe(true);
 resolve({success:true});await waitFor(()=>expect(mocks.refresh).toHaveBeenCalledOnce());await waitFor(()=>expect((screen.getByRole('button',{name:'Upload Small Logo'}) as HTMLButtonElement).disabled).toBe(false));expect(screen.queryByText(/Save your settings before/)).toBeNull();
});
