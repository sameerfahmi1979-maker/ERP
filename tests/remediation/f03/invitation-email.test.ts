import { expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { renderInvitationEmail, renderRecoveryEmail } from '@/lib/auth/invitation-email';
const input={displayName:'Test Employee',appName:'ALGT ERP',siteUrl:'https://erp.algt.net',logoPath:'/api/branding/public/app_logo?v=1',actionLink:'https://erp.algt.net/auth/verify?invitation='+'a'.repeat(43),expiresAt:'2026-09-26T08:00:00Z',supportEmail:'support@example.invalid'};
it('contains ALGT logo, HTML activation button, absolute ERP-only links and truthful expiry',()=>{
 const mail=renderInvitationEmail(input);const doc=new JSDOM(mail.htmlBody).window.document;
 expect(doc.querySelector('img')?.getAttribute('alt')).toBe('ALGT logo');
 expect(doc.querySelector('img')?.getAttribute('src')).toBe('https://erp.algt.net/api/branding/public/app_logo?v=1');
 expect(doc.querySelector('a')?.textContent).toContain('Set up your password');
 expect(mail.htmlBody).toContain('26 September 2026');expect(mail.htmlBody).toContain('12:00 (Dubai time)');
 expect(mail.htmlBody).toContain('24 hours');expect(mail.htmlBody).not.toContain('supabase.co');
 expect(doc.querySelectorAll('script,iframe,form')).toHaveLength(0);expect(mail.textBody).toContain(input.actionLink);
 expect(mail.htmlBody).toContain('max-width:600px');
});
const recovery={...input,actionLink:'https://erp.algt.net/auth/verify?token_hash='+'b'.repeat(56)+'&type=recovery'};
it('shares the branded HTML shell with recovery, without invitation wording or a false 24-hour lifetime',()=>{
 const mail=renderRecoveryEmail(recovery),doc=new JSDOM(mail.htmlBody).window.document;
 expect(mail.subject).toBe('Reset your password · ALGT ERP');
 expect(doc.querySelector('img')?.getAttribute('src')).toBe('https://erp.algt.net/api/branding/public/app_logo?v=1');
 expect(doc.querySelector('a')?.textContent).toContain('Reset your password');
 expect(doc.querySelector('a')?.getAttribute('href')).toBe(recovery.actionLink);
 expect(mail.htmlBody).toContain('background:#20324d');expect(mail.htmlBody).toContain('background:#ffc400');
 expect(mail.htmlBody).toContain('15 minutes');expect(mail.htmlBody).toContain('same browser window');
 expect(mail.htmlBody).not.toContain('24 hours');expect(mail.htmlBody).not.toContain('supabase.co');
 expect(mail.htmlBody).not.toContain('YOUR INVITATION');expect(mail.htmlBody).not.toContain('26 September 2026');
 expect(mail.htmlBody).toContain('Your password will not change unless');
 expect(doc.querySelectorAll('script,iframe,form')).toHaveLength(0);expect(mail.textBody).toContain(recovery.actionLink);
});
it('escapes recovery branding, greeting and support details',()=>{
 const mail=renderRecoveryEmail({...recovery,displayName:'<img src=x onerror=alert(1)>',appName:'ALGT\r\nBcc: bad',supportEmail:'x" onclick="evil'});
 expect(mail.htmlBody).toContain('&lt;img');expect(mail.htmlBody).not.toContain('<img src=x');
 expect(mail.htmlBody).not.toContain('mailto:');expect(mail.subject).not.toMatch(/[\r\n]/);
});
it.each([
 'https://evil.invalid/auth/verify?token_hash='+'b'.repeat(56)+'&type=recovery',
 'javascript:alert(1)',
 recovery.actionLink.replace('type=recovery','type=invite'),
 recovery.actionLink+'&next=https://evil.invalid',
 recovery.actionLink+'&type=recovery',
 recovery.actionLink+'#fragment',
 recovery.actionLink.replace('b'.repeat(56),'short'),
 input.actionLink,
])('rejects unsafe or wrong-flow recovery URL %s',actionLink=>expect(()=>renderRecoveryEmail({...recovery,actionLink})).toThrow());
it('never accepts recovery credentials in the invitation renderer or a remote recovery logo',()=>{
 expect(()=>renderInvitationEmail(recovery)).toThrow();
 expect(()=>renderRecoveryEmail({...recovery,logoPath:'https://evil.invalid/pixel'})).toThrow();
});
it('escapes user/branding data and never renders an unsafe support URL',()=>{
 const mail=renderInvitationEmail({...input,displayName:'<script>alert(1)</script>',appName:'ALGT\r\nBcc:bad',supportEmail:'" onmouseover="bad'});
 expect(mail.htmlBody).toContain('&lt;script&gt;');expect(mail.subject).not.toMatch(/[\r\n]/);expect(mail.htmlBody).not.toContain('mailto:');
});
it.each(['https://evil.invalid/auth/verify?invitation='+'a'.repeat(43),'javascript:alert(1)','https://erp.algt.net/auth/verify?invitation=short',input.actionLink+'&next=https://evil.invalid'])('rejects noncanonical activation URL %s',actionLink=>expect(()=>renderInvitationEmail({...input,actionLink})).toThrow());
it('rejects third-party logo tracking and invalid expiry',()=>{
 expect(()=>renderInvitationEmail({...input,logoPath:'https://evil.invalid/pixel'})).toThrow();
 expect(()=>renderInvitationEmail({...input,expiresAt:'invalid'})).toThrow();
});
