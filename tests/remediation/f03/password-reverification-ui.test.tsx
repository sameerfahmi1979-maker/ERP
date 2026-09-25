// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
const m=vi.hoisted(()=>({signOut:vi.fn(),navigate:vi.fn(),change:vi.fn(),required:vi.fn(),recovery:vi.fn()}));
vi.mock('@/features/auth/actions',()=>({signOut:m.signOut}));
vi.mock('@/lib/auth/client-session',()=>({navigateAfterIdentityChange:m.navigate}));
vi.mock('@/server/actions/users/account-security',()=>({changeOwnPassword:m.change,completeRequiredPasswordChange:m.required,recordPasswordResetCompleted:m.recovery}));
vi.mock('sonner',()=>({toast:{error:vi.fn(),success:vi.fn()}}));
import { PasswordReverification } from '@/features/auth/password-reverification';
import { ChangePasswordCard } from '@/features/profile/change-password-card';
import { ChangePasswordRequiredForm } from '@/features/auth/change-password-required-form';
import { ResetPasswordForm } from '@/features/auth/reset-password-form';
beforeEach(()=>{vi.clearAllMocks();m.signOut.mockResolvedValue({success:true});});
afterEach(cleanup);
it.each([
 ['self','/login?redirectTo=%2Fprofile'],
 ['required','/login?redirectTo=%2Fchange-password-required'],
 ['recovery','/forgot-password'],
] as const)('fresh-sign-in screen for %s focuses the heading and uses a fixed destination',async(mode,destination)=>{
 const ui=render(<PasswordReverification mode={mode}/>);
 expect(document.activeElement).toBe(ui.getByRole('heading', {level:2}));
 expect(ui.container.querySelector('input[type=password]')).toBeNull();
 expect(m.signOut).not.toHaveBeenCalled();
 fireEvent.click(ui.getByRole('button'));
 await waitFor(()=>expect(m.navigate).toHaveBeenCalledWith(destination));
});
it('keeps the session/page when sign-out is not confirmed and exposes an actionable error',async()=>{
 m.signOut.mockResolvedValue({success:false});const ui=render(<PasswordReverification mode="self"/>);
 fireEvent.click(ui.getByRole('button'));await waitFor(()=>expect(ui.getByRole('alert').textContent).toContain('could not be confirmed'));
 expect(m.navigate).not.toHaveBeenCalled();expect((ui.getByRole('button') as HTMLButtonElement).disabled).toBe(false);
});
it('does not double-submit or allow cancellation during sign-out',async()=>{
 let finish!:(v:{success:boolean})=>void;m.signOut.mockImplementation(()=>new Promise(r=>{finish=r;}));const cancel=vi.fn();
 const ui=render(<PasswordReverification mode="self" onCancel={cancel}/>);
 const button=ui.getByRole('button',{name:'Sign out and sign in again'});
 fireEvent.click(button);fireEvent.click(button);expect(m.signOut).toHaveBeenCalledOnce();
 expect((ui.getByRole('button',{name:'Cancel password change'}) as HTMLButtonElement).disabled).toBe(true);
 finish({success:true});await waitFor(()=>expect(m.navigate).toHaveBeenCalledOnce());
});
it('supports cancel without signing out or navigating',()=>{
 const cancel=vi.fn();const ui=render(<PasswordReverification mode="self" onCancel={cancel}/>);
 fireEvent.click(ui.getByRole('button',{name:'Cancel password change'}));expect(cancel).toHaveBeenCalledOnce();expect(m.signOut).not.toHaveBeenCalled();
});
it('handles transport errors without an automatic sign-out retry',async()=>{
 m.signOut.mockRejectedValue(new Error('synthetic timeout'));const ui=render(<PasswordReverification mode="required"/>);
 fireEvent.click(ui.getByRole('button'));await waitFor(()=>expect(ui.getByRole('alert').textContent).toContain('interrupted'));
 expect(m.navigate).not.toHaveBeenCalled();expect(m.signOut).toHaveBeenCalledOnce();
});
it.each(['self','required','recovery'] as const)('%s form clears new-password inputs when re-verification is required',async mode=>{
 const action=mode==='self'?m.change:mode==='required'?m.required:m.recovery;
 action.mockResolvedValue({success:false,requiresFreshSignIn:true,canStartNewAttempt:true});
 const ui=render(mode==='self'?<ChangePasswordCard/>:mode==='required'?<ChangePasswordRequiredForm/>:<ResetPasswordForm/>);
 fireEvent.change(ui.getByLabelText(/^New password/),{target:{value:'SyntheticTestOnly82!'}});
 fireEvent.change(ui.getByLabelText(/^Confirm/),{target:{value:'SyntheticTestOnly82!'}});
 fireEvent.submit(ui.container.querySelector('form')!);
 await waitFor(()=>expect(ui.getByRole('heading',{level:2}).textContent).toMatch(/Sign in again|Open a new password link/));
 expect(ui.container.querySelector('input[type=password]')).toBeNull();expect(m.signOut).not.toHaveBeenCalled();
 if(mode==='self'){
  fireEvent.click(ui.getByRole('button',{name:'Cancel password change'}));
  expect((ui.getByLabelText(/^New password/) as HTMLInputElement).value).toBe('');
  expect((ui.getByLabelText(/^Confirm/) as HTMLInputElement).value).toBe('');
 }
});
